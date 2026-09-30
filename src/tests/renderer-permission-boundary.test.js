import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function permissionHarness() {
  const source=fs.readFileSync('electron/main.cjs','utf8');
  const from=source.indexOf('function configureMediaPermissions(win) {');
  const to=source.indexOf('function createWindow() {',from);
  assert.ok(from>=0&&to>from);
  const handlers={};
  const own={getURL:()=> 'file:///app/dist/index.html'};
  const remote={getURL:()=> 'https://untrusted.example/'};
  const ses={
    setPermissionCheckHandler:fn=>{handlers.check=fn;},
    setPermissionRequestHandler:fn=>{handlers.request=fn;}
  };
  const setup=vm.runInNewContext(source.slice(from,to)+'; configureMediaPermissions',{
    isTrustedRendererNavigation:url=>url==='file:///app/dist/index.html'
  });
  setup({webContents:{...own,session:ses}});
  return {handlers,own,remote};
}

function ask(h,contents,permission,details={}) {
  return new Promise(resolve=>h.request(contents,permission,resolve,details));
}

test('untrusted windows do not inherit unrestricted geolocation/notification permissions',async()=>{
  const {handlers,remote}=permissionHarness();
  assert.equal(handlers.check(remote,'geolocation','https://untrusted.example'),false);
  assert.equal(handlers.check(remote,'notifications','https://untrusted.example'),false);
  assert.equal(await ask(handlers,remote,'geolocation'),false);
  assert.equal(await ask(handlers,remote,'notifications'),false);
});

test('trusted main window preserves existing geolocation and microphone behavior',async()=>{
  const {handlers,own}=permissionHarness();
  assert.equal(handlers.check(own,'geolocation','',{}),false,
    'a forged WebContents-like object must never be accepted as the real window');
});

test('trusted main WebContents accepts local user operations but denies remote frame URLs',async()=>{
  // Use real object identity so the permission check can distinguish frames and windows.
  const source=fs.readFileSync('electron/main.cjs','utf8');
  const from=source.indexOf('function configureMediaPermissions(win) {');
  const to=source.indexOf('function createWindow() {',from);
  const handlers={},own={getURL:()=> 'file:///app/dist/index.html'};
  own.session={
    setPermissionCheckHandler:fn=>{handlers.check=fn;},
    setPermissionRequestHandler:fn=>{handlers.request=fn;}
  };
  const setup=vm.runInNewContext(source.slice(from,to)+'; configureMediaPermissions',{
    isTrustedRendererNavigation:url=>url==='file:///app/dist/index.html'
  });
  setup({webContents:own});
  assert.equal(handlers.check(own,'geolocation','',{}),true);
  assert.equal(await ask(handlers,own,'geolocation'),true);
  assert.equal(handlers.check(own,'media','',{mediaType:'audio'}),true);
  assert.equal(handlers.check(own,'media','',{mediaType:'video'}),false);
  assert.equal(await ask(handlers,own,'media',{mediaTypes:['audio']}),true);
  assert.equal(await ask(handlers,own,'media',{mediaTypes:['audio','video']}),false);
  assert.equal(handlers.check(own,'notifications','',{requestingUrl:'https://untrusted.example'}),false);
  assert.equal(await ask(handlers,own,'notifications',{requestingUrl:'https://untrusted.example'}),false);
  // Remote subframes can share the main WebContents. Never infer their origin
  // only from the top-level webContents.getURL().
  assert.equal(handlers.check(own,'geolocation','https://untrusted.example',{}),false);
  assert.equal(await ask(handlers,own,'geolocation',{securityOrigin:'https://untrusted.example'}),false);
  assert.equal(handlers.check(own,'geolocation','file://',{}),true);
});
