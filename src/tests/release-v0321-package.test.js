import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('published version and dependency lock agree',()=>{
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
  assert.equal(pkg.version,'0.3.21');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
});

test('release notes exist for exact package version',()=>{
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  const file='release-notes/v'+pkg.version+'.md';
  assert.ok(fs.existsSync(file),file);
  const notes=fs.readFileSync(file,'utf8');
  assert.match(notes,new RegExp('Jarvis v'+pkg.version.replace(/\./g,'\\.')));
  assert.match(notes,/manual acceptance testing/);
});

test('every release candidate verifies installer, commit, hash and signature status',()=>{
  const yaml=fs.readFileSync('.github/workflows/build-windows.yml','utf8');
  const check=yaml.slice(yaml.indexOf('- name: Verify release candidate manifest and signing status'));
  assert.match(check,/RELEASE_CANDIDATE_VERSION_MISMATCH/);
  assert.match(check,/RELEASE_CANDIDATE_COMMIT_MISMATCH/);
  assert.match(check,/RELEASE_CANDIDATE_FILENAME_MISMATCH/);
  assert.match(check,/RELEASE_CANDIDATE_CHECKSUM_MISMATCH/);
  assert.match(check,/Authenticode \$status/);
  assert.match(check,/Write-Warning "Release candidate has no verified Authenticode signature/);
  assert.match(yaml,/if: github\.event_name == 'workflow_dispatch' && inputs\.publish_release == true && github\.ref == 'refs\/heads\/main'/);
});
