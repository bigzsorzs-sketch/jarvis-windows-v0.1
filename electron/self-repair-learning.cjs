'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeTokens(text='') {
  return [...new Set(String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9_/-]+/).filter((token) => token.length >= 3))];
}

class SelfRepairLearning {
  constructor(filePath) {
    this.filePath = filePath;
    this.maxEntries = 250;
  }

  _read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
      return Array.isArray(parsed?.entries) ? parsed : { version:1, entries:[] };
    } catch {
      return { version:1, entries:[] };
    }
  }

  _write(store) {
    fs.mkdirSync(path.dirname(this.filePath),{recursive:true});
    const tmp = this.filePath + '.tmp-' + process.pid;
    fs.writeFileSync(tmp,JSON.stringify(store,null,2),'utf8');
    fs.renameSync(tmp,this.filePath);
  }

  recordVerified(entry={}) {
    const title = String(entry.title || entry.repairId || 'Verified repair').slice(0,240);
    const files = Array.isArray(entry.files) ? entry.files.map(String).slice(0,30) : [];
    const evidence = String(entry.evidence || entry.summary || '').slice(0,4000);
    const validation = String(entry.validation || '').slice(0,3000);
    const signature = crypto.createHash('sha256').update(JSON.stringify({title,files,evidence})).digest('hex');
    const store = this._read();
    const existing = store.entries.find((item) => item.signature === signature);
    const next = {
      id:existing?.id || crypto.randomUUID(),
      signature,
      title,
      repairId:String(entry.repairId || ''),
      files,
      evidence,
      validation,
      verified:true,
      success:entry.success !== false,
      firstSeen:existing?.firstSeen || new Date().toISOString(),
      lastVerified:new Date().toISOString(),
      verificationCount:(existing?.verificationCount || 0) + 1
    };
    store.entries = [next, ...store.entries.filter((item) => item.signature !== signature)].slice(0,this.maxEntries);
    this._write(store);
    return next;
  }

  relevant(query='', limit=8) {
    const tokens = normalizeTokens(query);
    const store = this._read();
    return store.entries
      .map((entry) => {
        const hay = [entry.title, entry.repairId, ...(entry.files || []), entry.evidence, entry.validation].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        let score = entry.success ? 2 : 0;
        for (const token of tokens) if (hay.includes(token)) score += 3;
        return { entry, score };
      })
      .sort((a,b) => b.score - a.score || String(b.entry.lastVerified).localeCompare(String(a.entry.lastVerified)))
      .slice(0,Math.max(1,Math.min(20,Number(limit)||8)))
      .map(({entry}) => entry);
  }

  stats() {
    const store = this._read();
    return {
      entries:store.entries.length,
      successful:store.entries.filter((item) => item.success).length,
      lastVerified:store.entries[0]?.lastVerified || null
    };
  }

  clear() {
    this._write({version:1,entries:[]});
    return {success:true};
  }
}

module.exports = { SelfRepairLearning };
