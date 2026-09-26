# Assistant Tools Architecture — Refactored

**Status:** ✅ Centralized, cleaned, unified

## Summary of Changes

### Deleted (Redundant/Legacy)
- ❌ `lib/assistantTools/index.js` — re-export fallback
- ❌ `lib/assistantTools/contextTools.js` — duplicate context loading (170 lines)
- ❌ `lib/assistantTools/entityTools.js` — old, unused entity tools (58 lines)
- ❌ `lib/assistantTools/actionParser.js` — was never actually used in active codebase
- ❌ `lib/sanitizationLayer.js` — isolated, automotive-only code (moved to unified module)

### Created (New Unified Structure)
- ✅ `lib/assistantTools.js` — **SINGLE SOURCE OF TRUTH** (440 lines)
  - All TOOLS definitions (create_note, log_finance, etc.)
  - `loadFullContext()` — user-scoped context with caching
  - `buildSystemPrompt()` — system instruction builder
  - `parseActions()` — dual-format parser (JSON block + legacy regex)
  - `executeActions()` — action executor with validation
  
- ✅ `lib/assistantTools/sanitization.js` — **Unified sanitization** (130 lines)
  - `sanitizeString()` — XSS prevention
  - `sanitizeOBD2Data()` — automotive-specific
  - `sanitizeDiagnosticCode()` — DTC validation
  - `sanitizeObject()` — recursive object sanitization
  - `validateAction()` — action structure validation

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ pages/Chat.jsx                                               │
│ (only consumer of tools layer)                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ import { 
                       │   loadFullContext,
                       │   buildSystemPrompt,
                       │   parseActions,
                       │   executeActions,
                       │   TOOLS
                       │ } from '@/lib/assistantTools'
                       │
       ┌───────────────▼───────────────┐
       │ lib/assistantTools.js          │
       │ (440 lines, unified)           │
       │                                 │
       ├─ TOOLS {}                       │
       │  ├─ create_note                 │
       │  ├─ create_task                 │
       │  ├─ create_reminder             │
       │  ├─ create_contact             │
       │  ├─ log_blood_sugar            │
       │  ├─ log_meal                   │
       │  ├─ log_finance                │
       │  ├─ create_invoice             │
       │  ├─ generate_pdf               │
       │  ├─ draft_email                │
       │  ├─ translate_text             │
       │  ├─ save_memory                │
       │  ├─ call_contact               │
       │  ├─ search_contacts            │
       │  ├─ control_device (→ ENV_TOOLS) │
       │  ├─ analyze_ecosystem          │
       │  └─ optimize_*                 │
       │                                 │
       ├─ loadFullContext()              │
       │  └─ calls: sanitizeString()    │
       │                                 │
       ├─ buildSystemPrompt()            │
       │  └─ never includes raw amounts │
       │                                 │
       ├─ parseActions()                 │
       │  └─ calls: validateAction()    │
       │                                 │
       └─ executeActions()               │
          └─ calls: validateAction()    │
                                        │
    ┌─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/assistantTools/sanitization.js (130 lines)              │
│                                                              │
├─ sanitizeString()      — XSS, injection prevention          │
├─ sanitizeOBD2Data()    — automotive telemetry safe fields  │
├─ sanitizeDiagnosticCode() — DTC format validation         │
├─ sanitizeObject()      — recursive sanitization             │
├─ validateAction()      — action structure + tool name       │
└─────────────────────────────────────────────────────────────┘
```

## Module Boundaries (Clean)

### `lib/assistantTools.js` — Owned by
- ✅ Context loading (user-scoped, cached)
- ✅ System prompt generation (no sensitive data in prompt)
- ✅ Action parsing (two formats)
- ✅ Action execution (with validation)
- ✅ All TOOLS (unified, single namespace)

### `lib/assistantTools/sanitization.js` — Owned by
- ✅ Input sanitization (strings, objects)
- ✅ Output sanitization (API responses)
- ✅ Injection prevention (dangerous patterns)
- ✅ Format-specific sanitization (OBD2, DTC codes)
- ✅ Action validation

### NOT in tools layer (delegated to domain modules)
- 🔗 `lib/environmentTools.js` — smart home controls (delegated via TOOLS.control_device)
- 🔗 `lib/languageEngine.js` — language detection, translation
- 🔗 `lib/ecosystemEngine.js` — business ecosystem analysis
- 🔗 `lib/aiGateway.js` — LLM calls with fallbacks

## Data Flow

### Context Load
```
Chat.jsx
  → loadFullContext(forceRefresh?)
    → auth.me() [with auth guard]
    → listEntity(...) × 12 [3 waves in parallel]
      → apiThrottler.listEntity() [caching, rate limiting]
    → cache.set(userId, data)
    → return { settings, todos, memories, contacts, ... }
```

### Message Processing
```
Chat.jsx (sendMessage)
  → loadFullContext() [get fresh ctx]
  → detectLanguage(msg)
  → buildSystemPrompt(ctx, langInstruction, userMood)
  → parseActions(llmReply)
    → validateAction() × N
  → executeActions(actions)
    → TOOLS[action.tool](params) × N
      → sanitizeString() [within tool]
      → logAction() [track execution]
      → jarvis.entities.*.create/update/delete
```

### Action Execution
```
executeActions([{tool, params}])
  for each action:
    → validateAction(action)
    → const toolFn = TOOLS[action.tool]
    → result = await toolFn(params)
    → logAction(action.tool, ..., result)
    → return {action, result}
```

## Sanitization Rules (Unified)

| Where | What | Rule |
|-------|------|------|
| `loadFullContext()` | User settings | Keep only: id, email, full_name, role (safe fields) |
| `buildSystemPrompt()` | Finance amounts | Never include raw values; use counts only |
| `buildSystemPrompt()` | Health data | Never include raw values; omit from system prompt |
| `sanitizeString()` | LLM replies | Block patterns: `system:`, `__proto__`, `eval()`, etc. |
| `sanitizeOBD2Data()` | Automotive telemetry | Whitelist fields only: value, unit, timestamp, pid, name |
| `validateAction()` | Tool name | Only alphanumeric + underscore; no symbols |
| `executeActions()` | Before TOOLS call | Reject invalid actions, never crash the whole flow |

## No Longer in Use

### Old `lib/assistantTools/` structure
- **Problem:** Multiple files, each defining partial TOOLS, context, or actions
- **Why deleted:** Drift, conflicting definitions, false imports
- **Example:** `entityTools.js` defined `TOOLS.save_memory`, but `lib/assistantTools.js` defined a different version → runtime ambiguity

### `lib/sanitizationLayer.js`
- **Problem:** Isolated to automotive use only; no integration with main tools
- **Why merged:** Unified sanitization = single source of truth
- **New location:** `lib/assistantTools/sanitization.js`

## Import Paths (Single Truth)

### ✅ Correct (Used in Chat.jsx, correct imports)
```javascript
import { 
  loadFullContext, 
  buildSystemPrompt, 
  parseActions, 
  executeActions, 
  TOOLS 
} from '@/lib/assistantTools';

import { 
  sanitizeString, 
  validateAction, 
  sanitizeOBD2Data 
} from '@/lib/assistantTools/sanitization';
```

### ❌ Old/Broken (NO LONGER VALID)
```javascript
// These imports will fail (files deleted):
import { loadFullContext } from '@/lib/assistantTools/contextTools'; // ❌ DELETED
import { executeActions } from '@/lib/assistantTools/actionParser';  // ❌ DELETED
import { TOOLS } from '@/lib/assistantTools/index';                  // ❌ DELETED
import { sanitizeString } from '@/lib/sanitizationLayer';            // ❌ DELETED
```

## Build Checklist

- [x] No circular dependencies (sanitization → no deps on tools, tools → sanitization only)
- [x] All TOOLS defined once, in one place
- [x] `parseActions()` unified (JSON block + legacy regex)
- [x] `executeActions()` validates before execution
- [x] User-scoped context caching (no cross-user leaks)
- [x] Sanitization applied consistently
- [x] `Chat.jsx` imports only from `lib/assistantTools`
- [x] No fallback imports from deleted files

## Maintenance Notes

### Adding a New Tool
1. Add to `TOOLS` object in `lib/assistantTools.js`
2. Implement with `async` keyword
3. Call `sanitizeString()` on user inputs
4. Call `logAction()` after execution
5. Return `{success: bool, message: string, data?: object}`

Example:
```javascript
export const TOOLS = {
  ...existing_tools,
  
  my_new_tool: async ({ param1, param2 }) => {
    const p1 = sanitizeString(param1, 'my_new_tool param1');
    const data = await jarvis.entities.Something.create({ p1 });
    await logAction('my_new_tool', `Created: ${p1}`, { param1, param2 }, data);
    return { success: true, message: `✅ Done!`, data };
  }
};
```

### Adding Sanitization
1. Add rule to `lib/assistantTools/sanitization.js`
2. Export the function
3. Call from `loadFullContext()` or `executeActions()` as needed
4. Never add sanitization rules outside this module

---

## Verification (Build Pass)

```bash
# Build should succeed:
npm run build

# All imports must resolve:
✓ pages/Chat.jsx imports from lib/assistantTools
✓ lib/assistantTools imports sanitization.js
✓ No stray imports from deleted files
```

**Date:** 2026-04-20  
**Status:** ✅ CLEAN, UNIFIED, READY FOR PRODUCTION