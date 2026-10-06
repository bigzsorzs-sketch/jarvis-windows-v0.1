import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const source=fs.readFileSync('upgrade/Jarvis-OneClick-Upgrade.cmd','utf8');
const marker=source.match(/^### POWERSHELL ###\r?$/m);

test('updater bootstrap finds the standalone payload line for LF and CRLF files',()=>{
  assert.ok(marker);
  const bootstrap=source.slice(0,marker.index);
  const expression=bootstrap.match(/\[regex\]::Match\(\$c,'([^']+)'\)/)?.[1];
  assert.ok(expression,'the bootstrap must select a full marker line');
  const pattern=new RegExp(expression.replace(/^\(\?m\)/,''),'m');
  for (const input of [source.replace(/\r\n/g,'\n'),source.replace(/\r?\n/g,'\r\n')]) {
    const match=input.match(pattern);
    assert.ok(match);
    const payload=input.slice(match.index+match[0].length).trimStart();
    assert.ok(payload.startsWith("$ErrorActionPreference = 'Stop'"));
  }
  assert.match(bootstrap,/\$env:JARVIS_UPGRADE_SCRIPT/);
  assert.match(bootstrap,/set "JARVIS_UPGRADE_SCRIPT=%~f0"/);
});

test('native Windows CMD/PowerShell bootstrap executes only the harmless payload in a quoted path',
  {skip:process.platform !== 'win32'},()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"Jarvis's updater probe "));
    const script=path.join(root,"Jarvis's test upgrade.cmd");
    const result=path.join(root,'result.txt');
    try {
      const bootstrap=source.slice(0,marker.index);
      const harmless=bootstrap+"### POWERSHELL ###\n[IO.File]::WriteAllText($env:JARVIS_UPGRADE_PROBE_OUT, 'payload-only')\n";
      fs.writeFileSync(script,harmless.replace(/\r?\n/g,'\r\n'));
      execFileSync('cmd.exe',['/d','/s','/c',`""${script}""`],{
        windowsVerbatimArguments:true,timeout:30_000,
        env:{...process.env,JARVIS_UPGRADE_PROBE_OUT:result},
      });
      assert.equal(fs.readFileSync(result,'utf8'),'payload-only');
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
  });
