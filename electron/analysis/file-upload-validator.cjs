'use strict';

// Verify the data URL produced by FileReader.readAsDataURL in jarvisClient.js.
// This deliberately does not fetch remote URLs (which could permit SSRF).
// Passing this validation does NOT mean a file is malware-free or AI-compatible.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function validateUploadedFileUrl(value) {
  const fileUrl = typeof value === 'string' ? value.trim() : '';
  const rejected = (reason) => ({
    valid:false,
    allowed:false,
    file_url:null,
    reason,
    verified:'none'
  });
  if (!fileUrl) return rejected('FILE_URL_REQUIRED');
  // Reject oversized input before allocating a binary buffer.
  if (fileUrl.length > (Math.ceil(MAX_FILE_BYTES / 3) * 4) + 512) {
    return rejected('FILE_TOO_LARGE');
  }

  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?;base64,([a-z0-9+/]*={0,2})$/i.exec(fileUrl);
  if (!match) return rejected('FILE_DATA_URL_REQUIRED');
  const base64 = match[2];
  if (!base64.length || base64.length % 4 !== 0) return rejected('FILE_DATA_INVALID_BASE64');

  const decoded = Buffer.from(base64, 'base64');
  if (decoded.length > MAX_FILE_BYTES) return rejected('FILE_TOO_LARGE');
  if (decoded.toString('base64') !== base64) return rejected('FILE_DATA_INVALID_BASE64');

  return {
    valid:true,
    allowed:true,
    file_url:fileUrl,
    content_type:match[1] || 'application/octet-stream',
    byte_size:decoded.length,
    verified:'data_url_encoding'
  };
}

module.exports = { validateUploadedFileUrl, MAX_FILE_BYTES };
