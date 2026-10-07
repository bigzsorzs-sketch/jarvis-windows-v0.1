# Jarvis v0.3.27 — AI Unified Tool System

## Release Date
2026-10-07

## Overview
Jarvis v0.3.27 introduces a unified AI tool integration system that enables seamless command execution across all application features via voice and text input.

## Major Features

### 1. Intent Recognition Engine (`aiIntentEngine.js`)
- Pattern-based intent detection for instant command routing
- Support for Hungarian language commands
- 25+ built-in command patterns
- Confidence scoring and fallback to LLM

### 2. Unified Tool System
- **Maps & Navigation**: `open_map` — Google Maps integration
- **Health Tracking**: `read_latest_blood_sugar`, `log_blood_sugar`
- **Invoicing**: `create_invoice`, `generate_pdf`, `create_invoice_and_email`
- **Email**: `draft_email` with Gmail API fallback
- **Contacts**: `search_contacts`, `call_contact`, `create_contact`
- **Reminders**: `create_reminder`, `create_task`
- **Data**: `search_data`, `save_memory`
- **Devices**: `control_device`, `check_device_status`, `trigger_scene`, `run_routine`
- **Ecosystem**: `analyze_ecosystem`
- **Translation**: `translate_text`

### 3. Enhanced Command Routing
- Direct tool execution without LLM when pattern matches
- Voice command support through `globalVoiceActions.js`
- Fallback to assistant turn for complex queries
- Proper error handling and user feedback

### 4. System Improvements
- Full context loading with ecosystem analysis
- Action logging for all operations
- User confirmation for sensitive actions
- Hungarian language optimization
- Deterministic execution order

## Technical Changes

### New Files
- `src/lib/aiIntentEngine.js` — Intent recognition and tool execution

### Modified Files
- `src/lib/assistantTools.js` — Added 25+ tools, improved context loading
- `src/lib/CommandRouter.js` — Integrated AI tool command routing
- `src/lib/commandIntents.js` — Added `findAIToolCommand()` function
- `src/lib/globalVoiceActions.js` — Enhanced voice command support

## API Changes

### New Tools in TOOLS Object
```javascript
// Maps
TOOLS.open_map({ query, destination })

// Health
TOOLS.read_latest_blood_sugar()
TOOLS.log_blood_sugar({ value, time_of_day })

// Invoicing & Email
TOOLS.create_invoice({ client_name, client_email, items, notes })
TOOLS.generate_pdf({ invoice_id })
TOOLS.draft_email({ to, subject, body })
TOOLS.create_invoice_and_email({ client_name, client_email, items, notes, email_subject })

// Contacts
TOOLS.create_contact({ name, phone, email, relationship, notes })
TOOLS.search_contacts({ query })
TOOLS.call_contact({ name, phone })

// Tasks & Memory
TOOLS.create_task({ title, description, due_date, category })
TOOLS.create_reminder({ title, description, due_date, due_time, category })
TOOLS.save_memory({ content, category, importance })
TOOLS.create_note({ title, content })

// Data
TOOLS.search_data({ query, entity })
TOOLS.analyze_ecosystem()

// Translation
TOOLS.translate_text({ text, target_language })

// Devices
TOOLS.control_device(params)
TOOLS.check_device_status(params)
TOOLS.trigger_scene(params)
TOOLS.run_routine(params)
```

### New Functions
```javascript
// Intent engine
recognizeIntent(userMessage) → { handled, intent, tool, params, confidence }
executeTool(toolName, params) → result

// Command intents
findAIToolCommand(text) → { handled, intent, reply, actionResults }
```

## Voice Command Examples

```
User: "Nyisd meg a térképet Budapestre"
Jarvis: 🗺️ Térkép megnyitva: Budapest

User: "Mi a vércukor?"
Jarvis: 🩸 Legutóbbi vércukor: 5.2 mmol/L (reggel)

User: "Rögzíts 5.5 vércukort"
Jarvis: 🩸 Vércukor rögzítve: 5.5 mmol/L (reggel)

User: "Hívj meg Péter"
Jarvis: 📞 Hívás indítása: Péter

User: "Készíts számlát és küldd emailben"
Jarvis: ✅ Számla létrehozva és elküldve e-mailben

User: "Keress telefonszámokat"
Jarvis: 🔍 N találat: ...
```

## Backward Compatibility
- All existing chat and voice flows remain unchanged
- LLM-based assistant turn as fallback
- Offline mode supports basic tool commands
- No breaking changes to data models

## Testing
- ✅ Intent recognition: 25+ patterns tested
- ✅ Tool execution: all 25+ tools verified
- ✅ Voice commands: Hungarian language support
- ✅ Error handling: user-friendly messages
- ✅ Offline: basic commands work without API

## Known Limitations
1. Map, glucose, invoice commands require active user context
2. Voice commands optimized for clear Hungarian pronunciation
3. Smart device control depends on configured bridges
4. Offline mode supports instant tools only (no API calls)

## Security & Privacy
- All operations logged to ActionLog
- User authentication required for sensitive data access
- No sensitive context leaked to LLM on tool execution
- Same security boundaries as v0.3.26

## Migration Notes
No migration required. v0.3.27 activates unified tools automatically when installed over any v0.3.x version.

## Future Roadmap
- Natural language intent refinement
- More tool patterns and languages
- AI-assisted workflow automation
- Cross-tool action chaining
- Analytics and usage insights

## Support
Report issues at: https://github.com/bigzsorzs-sketch/jarvis-windows-v0.1/issues
