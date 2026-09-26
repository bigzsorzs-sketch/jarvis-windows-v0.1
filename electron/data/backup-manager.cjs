'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ITERATIONS = 310000;

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(String(passphrase), salt, ITERATIONS, 32, 'sha256');
}

function encryptJson(payload, passphrase) {
  if (!passphrase || String(passphrase).length < 8) throw new Error('BACKUP_PASSPHRASE_TOO_SHORT');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    format: 'jarvisbackup',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  });
}

function decryptJson(text, passphrase) {
  const envelope = JSON.parse(text);
  if (envelope?.format !== 'jarvisbackup' || envelope?.version !== 1) throw new Error('BACKUP_FORMAT_INVALID');
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const encrypted = Buffer.from(envelope.data, 'base64');
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

class BackupManager {
  constructor({ app, dialog, database, getSettings, saveSettings }) {
    this.app = app;
    this.dialog = dialog;
    this.database = database;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  backupDirectory() {
    return path.join(this.app.getPath('documents'), 'Jarvis Backups');
  }

  async create(passphrase) {
    const directory = this.backupDirectory();
    fs.mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suggested = path.join(directory, 'Jarvis-Backup-' + stamp + '.jarvisbackup');

    const selected = await this.dialog.showSaveDialog({
      title: 'Jarvis biztonsági mentés',
      defaultPath: suggested,
      filters: [{ name: 'Jarvis Backup', extensions: ['jarvisbackup'] }]
    });
    if (selected.canceled || !selected.filePath) return { canceled: true };

    const payload = {
      backup_version: 1,
      created_at: new Date().toISOString(),
      app_version: this.app.getVersion(),
      platform: process.platform,
      settings: this.getSettings(),
      database: this.database.exportSnapshot()
    };
    fs.writeFileSync(selected.filePath, encryptJson(payload, passphrase), 'utf8');
    return {
      success: true,
      path: selected.filePath,
      size: fs.statSync(selected.filePath).size,
      createdAt: payload.created_at
    };
  }

  async restore(passphrase) {
    const selected = await this.dialog.showOpenDialog({
      title: 'Jarvis mentés visszaállítása',
      properties: ['openFile'],
      filters: [{ name: 'Jarvis Backup', extensions: ['jarvisbackup'] }]
    });
    if (selected.canceled || !selected.filePaths?.[0]) return { canceled: true };

    let payload;
    try {
      payload = decryptJson(fs.readFileSync(selected.filePaths[0], 'utf8'), passphrase);
    } catch (error) {
      if (error?.code === 'ERR_OSSL_BAD_DECRYPT' || /authenticate/i.test(error?.message || '')) {
        throw new Error('BACKUP_PASSWORD_INVALID');
      }
      throw error;
    }

    if (!payload?.database) throw new Error('BACKUP_DATABASE_MISSING');
    this.database.importSnapshot(payload.database);
    if (payload.settings && typeof payload.settings === 'object') await this.saveSettings(payload.settings, { fromBackup: true });

    return {
      success: true,
      path: selected.filePaths[0],
      createdAt: payload.created_at || null,
      appVersion: payload.app_version || null
    };
  }
}

module.exports = { BackupManager };
