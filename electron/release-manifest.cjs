'use strict';

function verifyReleaseManifest(manifest,input={}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('UPDATE_MANIFEST_INVALID');
  }
  const version = String(input.version || '');
  const installer = String(input.installer || '');
  const sha256 = String(input.sha256 || '').toLowerCase();
  if (!/^\d+\.\d+\.\d+$/.test(version) || !installer || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('UPDATE_MANIFEST_EXPECTATION_INVALID');
  }
  if (String(manifest.version || '') !== version) throw new Error('UPDATE_MANIFEST_VERSION_MISMATCH');
  if (String(manifest.installer || '') !== installer) throw new Error('UPDATE_MANIFEST_INSTALLER_MISMATCH');
  if (String(manifest.sha256 || '').toLowerCase() !== sha256) throw new Error('UPDATE_MANIFEST_CHECKSUM_MISMATCH');
  if (String(manifest.ref || '') !== 'refs/heads/main') throw new Error('UPDATE_MANIFEST_REF_INVALID');
  const commit = String(manifest.commit || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('UPDATE_MANIFEST_COMMIT_INVALID');
  const target = String(input.targetCommitish || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(target)) throw new Error('UPDATE_MANIFEST_RELEASE_TARGET_INVALID');
  if (target !== commit) throw new Error('UPDATE_MANIFEST_RELEASE_TARGET_MISMATCH');
  return {version,installer,sha256,commit,ref:'refs/heads/main'};
}

module.exports = { verifyReleaseManifest };
