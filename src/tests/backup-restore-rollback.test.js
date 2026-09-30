import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {BackupManager}=require('../../electron/data/backup-manager.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));

function createHarness(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-backup-rollback-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'backup.jarvisbackup');
  let dbState={version:'FROM_BACKUP',entities:{Note:[{id:'backup-note'}]}};
  let settingsState={theme:'light'};
  let failSettingsOnce=false;
  let failDatabaseRollback=false;
  const history=[];
  const database={
    exportSnapshot:()=>clone(dbState),
    importSnapshot(value) {
      history.push({action:'db-import',version:value.version});
      if (failDatabaseRollback && value.version==='LOCAL_BEFORE_RESTORE') {
        throw new Error('ROLLBACK_DISK_WRITE_FAILED');
      }
      dbState=clone(value);
    }
  };
  const dialog={
    showSaveDialog:async()=>({canceled:false,filePath:file}),
    showOpenDialog:async()=>({canceled:false,filePaths:[file]}),
    showMessageBox:async()=>({response:1}),
  };
  const manager=new BackupManager({
    app:{getPath:()=>dir,getVersion:()=> '0.3.21'},
    dialog,database,
    getSettings:()=>clone(settingsState),
    saveSettings:async(next,options={})=>{
      history.push({action:'settings-save',theme:next.theme,rollback:options.rollback===true});
      settingsState=clone(next); // simulate partial write before a thrown error
      if(failSettingsOnce){failSettingsOnce=false;throw new Error('SETTINGS_WRITE_FAILED');}
    }
  });
  return {
    manager,history,
    setLocalState:()=>{
      dbState={version:'LOCAL_BEFORE_RESTORE',entities:{Note:[{id:'current-note'}]}};
      settingsState={theme:'dark'};
    },
    failNextSettingsSave:()=>{failSettingsOnce=true;},
    failDatabaseRollback:()=>{failDatabaseRollback=true;},
    get db(){return clone(dbState);},
    get settings(){return clone(settingsState);}
  };
}

test('ordinary approved restore updates both database and settings',async t=>{
  const h=createHarness(t),passphrase='correct-long-password';
  await h.manager.create(passphrase);
  h.setLocalState();
  const result=await h.manager.restore(passphrase);
  assert.equal(result.success,true);
  assert.equal(h.db.version,'FROM_BACKUP');
  assert.equal(h.settings.theme,'light');
});

test('a failed settings import rolls both stores back to pre-restore state',async t=>{
  const h=createHarness(t),passphrase='correct-long-password';
  await h.manager.create(passphrase);
  h.setLocalState();
  h.failNextSettingsSave();
  await assert.rejects(()=>h.manager.restore(passphrase),/SETTINGS_WRITE_FAILED/);
  assert.equal(h.db.version,'LOCAL_BEFORE_RESTORE');
  assert.equal(h.db.entities.Note[0].id,'current-note');
  assert.equal(h.settings.theme,'dark');
  assert.ok(h.history.some(x=>x.action==='settings-save'&&x.rollback));
});

test('a failed rollback is reported explicitly and never announced as success',async t=>{
  const h=createHarness(t),passphrase='correct-long-password';
  await h.manager.create(passphrase);
  h.setLocalState();
  h.failNextSettingsSave();
  h.failDatabaseRollback();
  await assert.rejects(()=>h.manager.restore(passphrase),
    /BACKUP_RESTORE_ROLLBACK_FAILED: database:ROLLBACK_DISK_WRITE_FAILED/);
  assert.equal(h.settings.theme,'dark','settings compensation still runs');
});

test('incorrect password does not alter the current database or settings',async t=>{
  const h=createHarness(t);
  await h.manager.create('correct-long-password');
  h.setLocalState();
  await assert.rejects(()=>h.manager.restore('wrong-password'),/BACKUP_PASSWORD_INVALID|authenticate/i);
  assert.equal(h.db.version,'LOCAL_BEFORE_RESTORE');
  assert.equal(h.settings.theme,'dark');
});
