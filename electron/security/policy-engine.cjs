'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PIN_SALT_HEX = '04784b43924b2f219422560f38861e44';
const PIN_HASH_HEX = '992bc1610ed929130f8750318f5cb95091541ae75256bd27389b7bf1a129340c';
const CORE_RULE_IDS = new Set(['RULE-00','RULE-01','RULE-02','RULE-03','RULE-04','RULE-05','RULE-06','RULE-07']);
const HIGH_RISK_ACTIONS = new Set([
  'system_file_write','system_file_delete','registry_write','registry_delete','service_stop','service_disable',
  'user_privilege_change','disk_format','boot_config_change','security_feature_disable','firewall_rule_change',
  'driver_install','scheduled_task_system','hosts_file_write','account_delete','obd_write'
]);

class PolicyEngine {
  constructor({ rulesPath, signaturePath, publicKeyPath, auditPath }) {
    this.rulesPath = rulesPath;
    this.signaturePath = signaturePath;
    this.publicKeyPath = publicKeyPath;
    this.auditPath = auditPath;
    this.failedPinAttempts = 0;
    this.lockedUntil = 0;
    this.rules = null;
    this.integrityOk = false;
    this.loadAndVerify();
  }

  loadAndVerify() {
    const data = fs.readFileSync(this.rulesPath);
    const signature = Buffer.from(fs.readFileSync(this.signaturePath, 'utf8').trim(), 'base64');
    const publicKey = fs.readFileSync(this.publicKeyPath, 'utf8');
    this.integrityOk = crypto.verify(null, data, publicKey, signature);
    if (!this.integrityOk) throw new Error('JARVIS_CORE_RULES_INTEGRITY_FAILURE');
    this.rules = JSON.parse(data.toString('utf8'));
    return true;
  }

  verifyPin(pin) {
    const now = Date.now();
    if (now < this.lockedUntil) return { ok:false, reason:'OWNER_PIN_TEMPORARILY_LOCKED', retryAt:this.lockedUntil };
    if (typeof pin !== 'string' && typeof pin !== 'number') return { ok:false, reason:'INVALID_OWNER_PIN' };
    const derived = crypto.scryptSync(String(pin), Buffer.from(PIN_SALT_HEX,'hex'), 32, { N:32768, r:8, p:1, maxmem:64*1024*1024 });
    const expected = Buffer.from(PIN_HASH_HEX,'hex');
    const ok = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    if (ok) {
      this.failedPinAttempts = 0;
      return { ok:true };
    }
    this.failedPinAttempts += 1;
    if (this.failedPinAttempts >= 3) {
      this.lockedUntil = now + 60_000;
      this.failedPinAttempts = 0;
    }
    return { ok:false, reason:'INVALID_OWNER_PIN' };
  }

  evaluate(action = {}) {
    if (!this.integrityOk) return this.decision('block', ['RULE-00','RULE-06'], 'Core rules integrity check failed', action);
    const ruleIds = [];
    const type = String(action.type || 'unknown');
    const target = String(action.target || '');
    const authorised = action.authorised !== false;

    if (action.humanSafetyRisk === true) return this.decision('block', ['RULE-01'], 'Human safety risk', action);
    if (action.outsideAuthorisedEnvironment === true) return this.decision('block', ['RULE-02'], 'Outside authorised environment', action);
    if (action.escapeOrReplication === true) return this.decision('block', ['RULE-03'], 'Escape or replication prohibited', action);
    if (action.unauthorisedAccess === true || !authorised) return this.decision('block', ['RULE-04'], 'Unauthorised access prohibited', action);
    if (action.selfPrivilegeEscalation === true) return this.decision('block', ['RULE-05'], 'Self privilege escalation prohibited', action);
    if (action.modifiesCoreRules === true || action.disablesPolicyEngine === true) return this.decision('block', ['RULE-06','RULE-07'], 'Core safety controls are immutable', action);

    if (HIGH_RISK_ACTIONS.has(type) || /^C:\\Windows(\\|$)/i.test(target) || /System32/i.test(target)) {
      ruleIds.push('RULE-08','RULE-10','RULE-11','RULE-15');
      return this.decision('confirm', ruleIds, 'High-risk system action requires owner confirmation', action);
    }
    if (action.transmitsSensitiveData === true) {
      ruleIds.push('RULE-09','RULE-11','RULE-15');
      return this.decision('confirm', ruleIds, 'Sensitive data transmission requires owner confirmation', action);
    }
    ruleIds.push('RULE-10','RULE-11','RULE-15');
    return this.decision('allow', ruleIds, 'Action allowed by policy', action);
  }

  requestOverride({ ruleId, pin, action }) {
    if (CORE_RULE_IDS.has(ruleId)) {
      const result = { ok:false, status:'blocked', ruleIds:[ruleId,'RULE-00','RULE-06'], reason:'CORE_RULE_CANNOT_BE_OVERRIDDEN' };
      this.audit('override_denied_core', { ruleId, action, result });
      return result;
    }
    const pinResult = this.verifyPin(pin);
    if (!pinResult.ok) {
      const result = { ok:false, status:'blocked', ruleIds:[ruleId], reason:pinResult.reason, retryAt:pinResult.retryAt || null };
      this.audit('override_denied_pin', { ruleId, action, result });
      return result;
    }
    const result = { ok:true, status:'allowed_once', ruleIds:[ruleId,'RULE-11','RULE-15'], reason:'OWNER_OVERRIDE_VALID_FOR_SINGLE_ACTION' };
    this.audit('override_allowed_once', { ruleId, action, result });
    return result;
  }

  decision(status, ruleIds, reason, action) {
    const result = { ok:status === 'allow', status, ruleIds, reason };
    this.audit('policy_decision', { action, result });
    return result;
  }

  audit(event, payload) {
    try {
      fs.mkdirSync(path.dirname(this.auditPath), { recursive:true });
      fs.appendFileSync(this.auditPath, JSON.stringify({ ts:new Date().toISOString(), event, ...payload }) + '\n', 'utf8');
    } catch {}
  }

  getPublicRules() {
    return { integrityOk:this.integrityOk, version:this.rules.version, name:this.rules.name, rules:this.rules.rules };
  }
}

module.exports = { PolicyEngine, CORE_RULE_IDS };
