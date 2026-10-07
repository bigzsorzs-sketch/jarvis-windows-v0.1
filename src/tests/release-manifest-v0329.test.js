import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifyReleaseManifest } = require('../../electron/release-manifest.cjs');

test('release manifest verification remains strict after Self-Repair GitHub removal', () => {
  const sha='1'.repeat(64);
  const commit='2'.repeat(40);
  const installer='Jarvis-Setup-0.3.29-x64.exe';
  const valid={version:'0.3.29',commit,ref:'refs/heads/main',installer,sha256:sha};
  const result=verifyReleaseManifest(valid,{version:'0.3.29',installer,sha256:sha,targetCommitish:commit});
  assert.equal(result.commit,commit);
  assert.throws(
    ()=>verifyReleaseManifest({...valid,sha256:'3'.repeat(64)},{version:'0.3.29',installer,sha256:sha,targetCommitish:commit}),
    /UPDATE_MANIFEST_CHECKSUM_MISMATCH/
  );
  assert.throws(
    ()=>verifyReleaseManifest({...valid,ref:'refs/heads/fix'},{version:'0.3.29',installer,sha256:sha,targetCommitish:commit}),
    /UPDATE_MANIFEST_REF_INVALID/
  );
  assert.throws(
    ()=>verifyReleaseManifest(valid,{version:'0.3.29',installer,sha256:sha,targetCommitish:'4'.repeat(40)}),
    /UPDATE_MANIFEST_RELEASE_TARGET_MISMATCH/
  );
  for (const targetCommitish of ['main','',null]) {
    assert.throws(
      ()=>verifyReleaseManifest(valid,{version:'0.3.29',installer,sha256:sha,targetCommitish}),
      /UPDATE_MANIFEST_RELEASE_TARGET_INVALID/
    );
  }
});

test('one-click updater verifies manifest before signer and installer handoff', () => {
  const main=fs.readFileSync('electron/main.cjs','utf8');
  const start=main.indexOf('async function performOneClickUpdate(');
  const end=main.indexOf('\nasync function ',start+20);
  const body=main.slice(start,end>start?end:undefined);
  const manifest=body.indexOf('verifyReleaseManifest(releaseManifest,{');
  const signer=body.indexOf('const signer = await verifyUpdateSigner');
  const handoff=body.indexOf("const child=spawn('powershell.exe'");
  assert.ok(manifest>=0);
  assert.ok(signer>manifest);
  assert.ok(handoff>signer);
});

test('release-manifest verifier is independent from removed GitHub Self-Repair module', () => {
  const main=fs.readFileSync('electron/main.cjs','utf8');
  assert.match(main,/require\('\.\/release-manifest\.cjs'\)/);
  assert.doesNotMatch(main,/github-self-repair|githubSelfRepair|jarvis:self-repair:github/);
  assert.equal(fs.existsSync('electron/github-self-repair.cjs'),false);
});
