import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { evaluateCodeqlCheck } = createRequire(import.meta.url)('../../scripts/verify-codeql-check.cjs');
const sha = '8ce19811c506bee302dad7698dcf6b9bef1445fc';
const trusted = (overrides = {}) => ({
  id: 100, name: 'CodeQL', app: { slug: 'github-advanced-security' },
  head_sha: sha, status: 'completed', conclusion: 'success', ...overrides,
});
const scanner = {
  id: 101, name: 'CodeQL security scan', app: { slug: 'github-actions' },
  head_sha: sha, status: 'completed', conclusion: 'success',
};

test('successful scanner execution cannot approve failed CodeQL security findings', () => {
  assert.equal(evaluateCodeqlCheck({ check_runs: [scanner, trusted({ conclusion: 'failure' })] }, sha), 'failure');
});

test('scanner success alone does not satisfy the CodeQL release gate', () => {
  assert.equal(evaluateCodeqlCheck({ check_runs: [scanner] }, sha), 'missing');
});

test('CodeQL release approval requires the trusted application and exact source commit', () => {
  assert.equal(evaluateCodeqlCheck({ check_runs: [
    trusted({ app: { slug: 'github-actions' } }),
    trusted({ head_sha: 'a'.repeat(40) }),
  ] }, sha), 'missing');
});

test('newer pending or failed analyses cannot fall back to an older successful result', () => {
  assert.equal(evaluateCodeqlCheck({ check_runs: [trusted(), trusted({ id: 102, status: 'in_progress', conclusion: null })] }, sha), 'pending');
  assert.equal(evaluateCodeqlCheck({ check_runs: [trusted(), trusted({ id: 102, conclusion: 'failure' })] }, sha), 'failure');
});

test('only a completed successful security result approves its exact commit', () => {
  assert.equal(evaluateCodeqlCheck({ check_runs: [scanner, trusted()] }, sha), 'success');
  for (const conclusion of [null, 'neutral', 'skipped', 'cancelled', 'timed_out', 'action_required']) {
    assert.equal(evaluateCodeqlCheck({ check_runs: [trusted({ conclusion })] }, sha), 'failure');
  }
});

test('malformed check responses and invalid source identities fail closed', () => {
  assert.throws(() => evaluateCodeqlCheck({}, sha), /CODEQL_CHECK_RESPONSE_INVALID/);
  assert.throws(() => evaluateCodeqlCheck({ check_runs: [] }, 'main'), /CODEQL_EXPECTED_SHA_INVALID/);
  assert.equal(evaluateCodeqlCheck({ check_runs: [trusted({ id: null })] }, sha), 'missing');
});
