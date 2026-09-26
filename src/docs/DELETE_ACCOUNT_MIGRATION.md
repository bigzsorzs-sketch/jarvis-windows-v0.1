# Account Deletion: Migration & Testing Guide

**Purpose:** Guidance for migrating from old deleteAccount to new hardened version  
**Target Audience:** QA, DevOps, Backend teams

---

## Migration Path

### Old Implementation
```typescript
// functions/deleteAccount/entry.ts (OLD)
const OWNED_ENTITIES = [
  'UserSettings', 'Memory', 'TodoItem', // ... only 13 entities
];
// Issues:
// ❌ Incomplete entity list
// ❌ No preview/dry-run
// ❌ No audit logging
// ❌ No cascade delete for Business
// ❌ No error handling
// ❌ Silent failures
```

### New Implementation
```typescript
// functions/deleteAccount/entry.ts (NEW)
const DATA_LIFECYCLE = {
  personal: [...],     // 8 entities
  health: [...],       // 3 entities
  finance: [...],      // 2 entities
  smart_home: [...],   // 5 entities
  business: [...],     // 4 entities + cascade
  tracking: [...],     // 3 entities
  media: [...],        // 1 entity
  preserved: [...]     // 7 entities (not deleted)
};
// Improvements:
// ✅ Complete coverage (26 user-owned)
// ✅ Preview mode (safe dry-run)
// ✅ Audit logging (ActionLog)
// ✅ Cascade delete (Business → children)
// ✅ Error handling (per-record resilience)
// ✅ Verification (post-deletion check)
```

---

## Testing Strategy

### Phase 1: Unit Testing (In Development)

#### Test 1: Preview Mode
```javascript
// Test: Preview returns correct counts, no deletion
const testUser = "test-preview@example.com";

// Setup: Create test data
await jarvis.entities.Note.create({ title: "Test", created_by: testUser });
await jarvis.entities.TodoItem.create({ title: "Test", created_by: testUser });
await jarvis.entities.Business.create({ name: "Test", created_by: testUser });

// Action: Call preview
const response = await deleteAccount({ mode: "preview" });

// Assert:
expect(response.preview_mode).toBe(true);
expect(response.by_category.personal.Note.count).toBe(1);
expect(response.by_category.personal.TodoItem.count).toBe(1);
expect(response.by_category.business.Business.count).toBe(1);
expect(response.total_records).toBe(3);

// Verify: Data still exists
const notes = await jarvis.entities.Note.filter({ created_by: testUser });
expect(notes.length).toBe(1); // NOT deleted
```

#### Test 2: Execute with Confirmation
```javascript
// Test: Execute deletes all records when confirm=true

// Setup: Create test data
const testUser = "test-execute@example.com";
await jarvis.entities.Note.create({ title: "Test", created_by: testUser });
await jarvis.entities.Contact.create({ name: "Test", created_by: testUser });

// Action: Call execute
const response = await deleteAccount({ 
  mode: "execute", 
  confirm: true 
});

// Assert:
expect(response.status).toBe("completed");
expect(response.total_deleted).toBe(2);
expect(response.by_category.personal.Note.deleted).toBe(1);
expect(response.by_category.personal.Contact.deleted).toBe(1);

// Verify: Data deleted
const notes = await jarvis.entities.Note.filter({ created_by: testUser });
expect(notes.length).toBe(0); // Deleted
```

#### Test 3: Execute without Confirmation (Fails)
```javascript
// Test: Execute fails if confirm=true not provided

const response = await deleteAccount({ 
  mode: "execute"
  // NO confirm flag
});

// Assert:
expect(response.status).toBe(400);
expect(response.error).toContain("confirm=true");
```

#### Test 4: Cascade Delete (Business + Children)
```javascript
// Test: Deleting Business cascades to Employee, Project, Client

const testUser = "test-cascade@example.com";

// Setup: Create business + children
const business = await jarvis.entities.Business.create({ 
  name: "Test Co", 
  created_by: testUser 
});
const employee = await jarvis.entities.Employee.create({ 
  name: "John", 
  business_id: business.id, 
  created_by: testUser 
});
const project = await jarvis.entities.BusinessProject.create({ 
  name: "Project", 
  business_id: business.id, 
  created_by: testUser 
});

// Action: Execute delete
const response = await deleteAccount({ 
  mode: "execute", 
  confirm: true 
});

// Assert cascade results
expect(response.cascade_results.business).toBe(1);
expect(response.cascade_results.cascade.Employee).toBe(1);
expect(response.cascade_results.cascade.BusinessProject).toBe(1);

// Verify: All deleted
const businesses = await jarvis.entities.Business.filter({ created_by: testUser });
const employees = await jarvis.entities.Employee.filter({ created_by: testUser });
const projects = await jarvis.entities.BusinessProject.filter({ created_by: testUser });
expect(businesses.length).toBe(0);
expect(employees.length).toBe(0);
expect(projects.length).toBe(0);
```

#### Test 5: Verification (Post-Deletion)
```javascript
// Test: Post-deletion verification detects orphaned records

const testUser = "test-verify@example.com";
const testData = await jarvis.entities.Note.create({ 
  title: "Test", 
  created_by: testUser 
});

// Execute delete
const response = await deleteAccount({ 
  mode: "execute", 
  confirm: true 
});

// Assert verification
expect(response.verification.orphaned_records).toEqual([]);
expect(response.verification.warnings).toEqual([]);
```

#### Test 6: Audit Logging
```javascript
// Test: Both preview and execute are logged to ActionLog

const testUser = "test-audit@example.com";

// Preview
await deleteAccount({ mode: "preview" });

// Execute
await deleteAccount({ mode: "execute", confirm: true });

// Check ActionLog
const logs = await jarvis.entities.ActionLog.filter({
  action_type_like: "account_deletion_%",
  description_like: testUser
});

// Assert
expect(logs.length).toBe(2); // preview + execute
expect(logs[0].action_type).toBe("account_deletion_preview");
expect(logs[1].action_type).toBe("account_deletion_execute");
```

---

### Phase 2: Integration Testing (Staging)

#### Test: Multi-Entity Deletion
```bash
# Create test user with diverse data
curl -X POST https://staging.app.local/api/test-setup \
  -d '{"email": "integration-test@example.com", "count": 100}'

# Preview
curl -X GET https://staging.app.local/deleteAccount \
  -d '{"mode": "preview"}'

# Should show:
# - 100 records across multiple entities
# - Cascade info for Business

# Execute
curl -X POST https://staging.app.local/deleteAccount \
  -d '{"mode": "execute", "confirm": true}'

# Should show:
# - All 100 deleted
# - Cascade results counted
# - Verification passed
```

#### Test: Error Resilience
```bash
# Simulate partial failure: mock one entity to fail

# Execute with failure
curl -X POST https://staging.app.local/deleteAccount \
  -d '{"mode": "execute", "confirm": true}'

# Should:
# - Delete other entities successfully
# - Log failed entity in results.errors
# - Return 200 OK with status: "completed_with_errors"
# - NOT crash or rollback
```

---

### Phase 3: Production Validation

#### Pre-Deployment
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Code review approved
- [ ] Security audit passed
- [ ] Documented entity list reviewed

#### Post-Deployment (Day 1)
- [ ] Test user deletion in production
- [ ] Verify ActionLog entries created
- [ ] Check post-deletion verification
- [ ] Monitor for errors in logs

#### Post-Deployment (Week 1)
- [ ] Real user deletion tested (test account)
- [ ] Verify no orphaned records remain
- [ ] Audit log reviewed for completeness
- [ ] Performance acceptable (< 5s for 1000 records)

---

## Rollback Plan

### If Issues Found (Immediately Post-Deployment)
```
1. Disable deleteAccount endpoint
2. Notify users: "Account deletion temporarily unavailable"
3. Investigate in staging
4. Fix and re-test
5. Redeploy
```

### If Data Corruption Detected
```
1. Restore from backup (24h window)
2. Rerun preview on restored data
3. Identify root cause
4. Fix in new version
5. Redeploy and verify
```

---

## Rollout Strategy

### Option A: Gradual (Recommended)
```
Week 1: QA only (test accounts)
Week 2: Beta users (10% of users)
Week 3: General availability
Week 4: Monitor, collect feedback
```

### Option B: Big Bang (Faster)
```
1. Deploy to staging
2. Full integration tests
3. Deploy to production
4. Monitor closely for 24h
5. Have rollback ready
```

---

## Monitoring & Metrics

### Key Metrics to Track
```
- Deletion requests: mode=preview vs mode=execute
- Success rate: % of executions without errors
- Performance: execution time by total_deleted count
- Errors: per-entity failure rates
- Orphaned records: # of records remaining after deletion
```

### Alerts to Set Up
```
- DeleteAccount errors > 5 in 1 hour
- Execution time > 30 seconds
- Orphaned records detected in verification
- Cascade deletion failures
- ActionLog insertion failures
```

---

## FAQ

**Q: Can users delete other users' data?**  
A: No. Filter is always `{ created_by: user.email }`. User-scoped.

**Q: What if deletion fails midway?**  
A: Per-record failures logged, deletion continues. User can retry safely (idempotent).

**Q: Can preview be called multiple times?**  
A: Yes. Read-only, no state changes.

**Q: What about data in backups?**  
A: Deletion is point-in-time. Backups retain old data (GDPR 30-day retention acceptable).

**Q: How long does deletion take?**  
A: ~100ms per entity, ~1-5 seconds for typical user (100-1000 records).

**Q: What if cascade delete fails?**  
A: Entire deletion fails (500 error). Manual cleanup required.

---

**Status:** Ready for testing  
**Next Step:** Run Phase 1 unit tests in development environment