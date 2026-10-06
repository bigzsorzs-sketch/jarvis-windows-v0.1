import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/build-windows.yml','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('public release requires explicit dispatch on main, not a special commit message',()=>{
  assert.equal(workflow.includes("startsWith(github.event.head_commit.message, 'Publish v0.3.20 combined approved')"),false);
  assert.equal(workflow.includes('$oneTimeOwnerApproval'),false);
  const publish=workflow.slice(workflow.indexOf('      - name: Publish immutable GitHub release'));
  assert.ok(publish.includes("if: github.event_name == 'workflow_dispatch' && inputs.publish_release == true && github.ref == 'refs/heads/main'"));
});

test('new release must have accurate, version-specific release notes',()=>{
  assert.match(workflow,/release-notes\/v\$\(\$pkg\.version\)\.md/);
  assert.match(workflow,/throw "Version-specific release notes are required/);
  assert.match(workflow,/--notes-file \$notesFile/);
  assert.doesNotMatch(workflow,/--notes "Jarvis v0\.3\.20 adds/);
});

test('unsigned publication needs a separate explicit owner override',()=>{
  assert.match(workflow,/input[s]?\.allow_unsigned_release/);
  assert.match(workflow,/if \(\[string\]\$signature\.Status -ne "Valid" -and -not \$allowUnsigned\)/);
  assert.match(workflow,/\$allowUnsigned = \("\$\{\{ inputs\.allow_unsigned_release \}\}" -eq "true"\)/);
});

test('the draft branch has a package version but publication remains gated',()=>{
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' && inputs\.publish_release == true && github\.ref != 'refs\/heads\/main'/);
  assert.match(workflow,/gh release view \$tag/);
});

test('Self-Repair release dispatch can pin the exact main commit and package version',()=>{
  assert.match(workflow,/expected_commit:/);
  assert.match(workflow,/expected_version:/);
  assert.match(workflow,/RELEASE_DISPATCH_COMMIT_MISMATCH/);
  assert.match(workflow,/RELEASE_DISPATCH_VERSION_MISMATCH/);
});
