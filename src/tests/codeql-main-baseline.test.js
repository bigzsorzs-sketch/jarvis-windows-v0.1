import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { newCodeqlFindings } = createRequire(import.meta.url)('../../scripts/verify-codeql-sarif.cjs');
const finding = (overrides = {}) => ({
  ruleId:'js/test-finding', message:{ text:'reviewed existing finding' },
  locations:[{ physicalLocation:{ artifactLocation:{ uri:'src/example.js' }, region:{ startLine:10 } } }],
  partialFingerprints:{ primaryLocationLineHash:'known-line:1' }, ...overrides,
});
const report = (...results) => ({ runs:[{ results }] });

test('main comparison preserves existing finding identities across harmless line shifts', () => {
  const shifted = finding({ locations:[{ physicalLocation:{ artifactLocation:{ uri:'src/example.js' }, region:{ startLine:40 } } }] });
  assert.deepEqual(newCodeqlFindings(report(shifted), report(finding())), []);
});

test('a new source finding blocks main even when an older finding has the same rule and file', () => {
  const added = finding({ partialFingerprints:{ primaryLocationLineHash:'new-line:1' } });
  assert.equal(newCodeqlFindings(report(finding(), added), report(finding())).length, 1);
});

test('CodeQL baselines cannot approve findings in a different file or under a different rule', () => {
  const otherFile = finding({ locations:[{ physicalLocation:{ artifactLocation:{ uri:'src/other.js' } } }] });
  const otherRule = finding({ ruleId:'js/different-security-rule' });
  assert.equal(newCodeqlFindings(report(otherFile, otherRule), report(finding())).length, 2);
});

test('resolved findings and an empty valid scan pass without introducing a new alert', () => {
  assert.deepEqual(newCodeqlFindings(report(), report(finding())), []);
  assert.deepEqual(newCodeqlFindings(report(), report()), []);
});

test('missing or malformed analysis data cannot silently approve a main release', () => {
  assert.throws(() => newCodeqlFindings({}, report()), /CODEQL_SARIF_INVALID/);
  assert.throws(() => newCodeqlFindings(report(), { runs:[] }), /CODEQL_SARIF_INVALID/);
  assert.throws(() => newCodeqlFindings(report(finding({ partialFingerprints:{} })), report()), /CODEQL_SARIF_FINDING_IDENTITY_MISSING/);
  assert.throws(() => newCodeqlFindings(report(), { runs:[{}] }), /CODEQL_SARIF_RESULTS_INVALID/);
});
