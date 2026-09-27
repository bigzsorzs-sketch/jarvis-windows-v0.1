'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CORE_RULE_IDS = new Set(['RULE-00','RULE-01','RULE-02','RULE-03','RULE-04','RULE-05','RULE-06','RULE-07']);
const HIGH_RISK_ACTIONS = new Set([
  'system_file_write','system_file_delete','registry_write','registry_delete','service_stop','service_disable',
  'user_privilege_change','disk_format','boot_config_change','security_feature_disable','firewall_rule_change',
  'driver_install','scheduled_task_system','hosts_file_write','account_delete','obd_write'
]);
const OVERRIDE_TTL_MS = 2 * 60 * 1000;

function actionFingerprint(action = {}) {
  const canonical = {
    type:String(action.type || 'unknown'),
    target:String(action.target || ''),
    transmitsSensitiveData:action.transmitsSensitiveData === true,
    humanSafetyRisk:action.humanSafetyRisk === true,
    outsideAuthorisedEnvironment:action.outsideAuthorisedEnvironment === true,
    unauthorisedAccess:action.unauthorisedAccess === true,
    selfPrivilegeEscalation:action.selfPrivilegeEscalation === true,
    modifiesCoreRules:action.modifiesCoreRules === true,
    disablesPolicyEngine:action.disablesPolicyEngine === true
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

class PolicyEngine {
  constructor({ rulesPath, signaturePath, publicKeyPath, auditPath, pinVerifierPath }) {
    this.rulesPath = rulesPath;
    this.signaturePath = signaturePath;
    this.publicKeyPath = publicKeyPath;
    this.auditPath = auditPath;
    this.pinVerifierPath = pinVerifierPath;
    this.failedPinAttempts = 0;
    this.lockedUntil = 0;
    this.rules = null;
    this.integrityOk = false;
    this.overrideTokens = new Map();
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

  getPinStatus() {
    return { configured:Boolean(this.readPinVerifier()) };
  }

  readPinVerifier() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.pinVerifierPath, 'utf8'));
      if (!parsed?.salt || !parsed?.hash) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  setOwnerPin(pin) {
    const value = String(pin || '');
    if (!/^\d{4,12}$/.test(value)) throw new Error('OWNER_PIN_MUST_BE_4_TO_12_DIGITS');
    const salt = crypto.randomBytes(32);
    const derived = crypto.scryptSync(value, salt, 32, { N:65536, r:8, p:1, maxmem:128*1024*1024 });
    fs.mkdirSync(path.dirname(this.pinVerifierPath), { recursive:true });
    fs.writeFileSync(this.pinVerifierPath, JSON.stringify({
      version:1,
      kdf:'scrypt',
      salt:salt.toString('base64'),
      hash:derived.toString('base64'),
      createdAt:new Date().toISOString()
    }, null, 2), { encoding:'utf8', mode:0o600 });
    this.failedPinAttempts = 0;
    this.lockedUntil = 0;
    this.overrideTokens.clear();
    this.audit('owner_pin_configured', { configured:true });
    return { configured:true };
  }

  verifyPin(pin) {
    const now = Date.now();
    if (now < this.lockedUntil) return { ok:false, reason:'OWNER_PIN_TEMPORARILY_LOCKED', retryAt:this.lockedUntil };
    const verifier = this.readPinVerifier();
    if (!verifier) return { ok:false, reason:'OWNER_PIN_NOT_CONFIGURED' };
    if (typeof pin !== 'string' && typeof pin !== 'number') return { ok:false, reason:'INVALID_OWNER_PIN' };

    let salt;
    let expected;
    try {
      salt = Buffer.from(verifier.salt, 'base64');
      expected = Buffer.from(verifier.hash, 'base64');
    } catch {
      return { ok:false, reason:'OWNER_PIN_VERIFIER_INVALID' };
    }

    const derived = crypto.scryptSync(String(pin), salt, expected.length, { N:65536, r:8, p:1, maxmem:128*1024*1024 });
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
    const authorised = action.authorised === true;

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
    if (!action || typeof action !== 'object') {
      return { ok:false, status:'blocked', ruleIds:[ruleId], reason:'OVERRIDE_ACTION_REQUIRED' };
    }

    const decision = this.evaluate(action);
    if (decision.status !== 'confirm' || !decision.ruleIds.includes(ruleId)) {
      const result = { ok:false, status:'blocked', ruleIds:decision.ruleIds, reason:'OVERRIDE_NOT_APPLICABLE_TO_ACTION' };
      this.audit('override_denied_not_applicable', { ruleId, action, result });
      return result;
    }

    const pinResult = this.verifyPin(pin);
    if (!pinResult.ok) {
      const result = { ok:false, status:'blocked', ruleIds:[ruleId], reason:pinResult.reason, retryAt:pinResult.retryAt || null };
      this.audit('override_denied_pin', { ruleId, action, result });
      return result;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + OVERRIDE_TTL_MS;
    this.overrideTokens.set(token, {
      ruleId:String(ruleId || ''),
      fingerprint:actionFingerprint(action),
      expiresAt
    });
    const result = {
      ok:true,
      status:'allowed_once',
      token,
      expiresAt,
      ruleIds:[ruleId,'RULE-11','RULE-15'],
      reason:'OWNER_OVERRIDE_VALID_FOR_SINGLE_ACTION'
    };
    this.audit('override_allowed_once', { ruleId, action, result:{ ...result, token:'[redacted]' } });
    return result;
  }

  consumeOverride(token, action) {
    if (!token || typeof token !== 'string') return false;
    const grant = this.overrideTokens.get(token);
    this.overrideTokens.delete(token);
    if (!grant) return false;
    if (Date.now() > grant.expiresAt) {
      this.audit('override_expired', { ruleId:grant.ruleId, action });
      return false;
    }
    const matches = crypto.timingSafeEqual(
      Buffer.from(grant.fingerprint, 'hex'),
      Buffer.from(actionFingerprint(action), 'hex')
    );
    this.audit(matches ? 'override_consumed' : 'override_action_mismatch', { ruleId:grant.ruleId, action });
    return matches;
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
    return { integrityOk:this.integrityOk, version:this.rules.version, name:this.rules.name, rules:this.rules.rules, ownerPinConfigured:this.getPinStatus().configured };
  }
}

module.exports = { PolicyEngine, CORE_RULE_IDS, actionFingerprint };
