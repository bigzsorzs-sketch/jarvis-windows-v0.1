'use strict';

function evaluateCodeqlCheck(payload, expectedSha) {
  if (!/^[a-f0-9]{40}$/i.test(String(expectedSha || ''))) {
    throw new Error('CODEQL_EXPECTED_SHA_INVALID');
  }
  if (!payload || !Array.isArray(payload.check_runs)) {
    throw new Error('CODEQL_CHECK_RESPONSE_INVALID');
  }
  const checks = payload.check_runs.filter(check =>
    check && check.name === 'CodeQL'
      && check.app?.slug === 'github-advanced-security'
      && check.head_sha === expectedSha
      && Number.isSafeInteger(check.id) && check.id > 0
  ).sort((a, b) => b.id - a.id);
  const latest = checks[0];
  if (!latest) return 'missing';
  if (latest.status === 'queued' || latest.status === 'in_progress') return 'pending';
  if (latest.status !== 'completed') return 'failure';
  return latest.conclusion === 'success' ? 'success' : 'failure';
}

module.exports = { evaluateCodeqlCheck };

if (require.main === module) {
  try {
    const fs = require('node:fs');
    const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    console.log(evaluateCodeqlCheck(payload, process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
