'use strict';

function findings(sarif) {
  if (!sarif || !Array.isArray(sarif.runs) || !sarif.runs.length) {
    throw new Error('CODEQL_SARIF_INVALID');
  }
  const results = new Map();
  for (const run of sarif.runs) {
    if (!Array.isArray(run.results)) throw new Error('CODEQL_SARIF_RESULTS_INVALID');
    for (const result of run.results) {
      const file = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
      const fingerprint = result.partialFingerprints?.primaryLocationLineHash;
      if (typeof result.ruleId !== 'string' || !result.ruleId
          || typeof file !== 'string' || !file
          || typeof fingerprint !== 'string' || !fingerprint) {
        throw new Error('CODEQL_SARIF_FINDING_IDENTITY_MISSING');
      }
      const key = JSON.stringify([result.ruleId, file, fingerprint]);
      results.set(key, { ruleId:result.ruleId, file, fingerprint, message:result.message?.text || '' });
    }
  }
  return results;
}

function newCodeqlFindings(current, baseline) {
  const previous = findings(baseline);
  return Array.from(findings(current)).filter(([key]) => !previous.has(key)).map(([, result]) => result);
}

module.exports = { newCodeqlFindings };

if (require.main === module) {
  try {
    const fs = require('node:fs');
    const current = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const baseline = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const added = newCodeqlFindings(current, baseline);
    if (added.length) {
      for (const finding of added) console.error(JSON.stringify(finding));
      throw new Error('CODEQL_NEW_FINDINGS_BLOCK_RELEASE:' + added.length);
    }
    console.log('No new CodeQL findings versus the exact successful main analysis.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
