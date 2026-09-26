# Jarvis v0.8.0 Integrations + Situation Layer

Status: staged on `develop/v0.8.0-integrations-situation`.

## Purpose

Complete the six-package development chain with a reusable integration/extension foundation and deepen the "one assistant, many capabilities" behaviour.

The user should not need to remember which menu owns a function. Jarvis routes natural text/voice requests to the appropriate safe capability based on the current situation.

## Included

### Cross-module situation handling
- Explicit emergency-call intent bypasses AI and long-running workflows.
- Latest recorded glucose can be read by voice from anywhere without invoking the AI model.
- Saved locations can be addressed naturally (for example "vigyél haza").
- The Locations page registers live context and navigation capabilities.
- The Image Editor registers contextual generation, undo/redo and zoom capabilities.
- Destructive canvas clearing is declared as confirmation-required.

### Navigation
- Natural Hungarian "vigyél ..." navigation phrases.
- Saved-location lookup by name and common type aliases such as home/work.
- Navigation to saved latitude/longitude through the existing route tracker.
- Current route and saved-place context exposed to Jarvis.

### Health / CGM foundation
- Provider-agnostic CGM registry.
- Local-history provider for readings already stored in Jarvis.
- Clearly labelled simulated demo CGM provider for demos and UI development.
- Global "mennyi a cukrom?" voice action reads the latest stored value and trend.
- Direct Bluetooth CGM code is explicitly gated behind an experimental opt-in.
- The UI no longer presents experimental direct Bluetooth as a normal production integration.
- No medication or insulin dosing action is added.

### Extensions
- Safe extension manifest registry.
- Built-in capability manifests for contextual voice, automotive, navigation, vision and health.
- Settings card showing installed built-in extensions and their status.
- External extension code is not downloaded/eval'd by the registry. Executable capabilities still require a reviewed Jarvis release or trusted provider boundary.

### Existing-function quality fixes
- OBD2Scanner fake/random scan percentage removed.
- OBD scan collection changed to a sequential loop so slow adapter commands do not overlap.
- Image Editor bottom quick-generation path now uses the real image-generation runtime instead of incorrectly sending an image request through the text LLM gateway.
- Image Editor gains contextual voice actions.

## Safety boundaries

- Emergency calls only trigger from an explicit 999/112 command. Desktop Jarvis attempts to hand the `tel:` request to the operating-system handler and never claims that a call connected unless the platform can confirm it.
- Glucose voice output reports stored/provider data and trend; it does not calculate treatment or dosing.
- Simulated CGM data is always labelled as demo/simulated.
- Direct CGM Bluetooth remains experimental until a real supported provider/device integration is verified.
- Destructive/write capabilities must declare confirmation requirements before execution.
- Plugin manifests cannot execute arbitrary remote code.

## Upgrade path

1. v0.2 real-PC smoke test.
2. Release v0.3 only after the v0.3 acceptance checklist passes.
3. Validate and release v0.4 contextual voice.
4. Hardware-smoke-test and release v0.5 OBD.
5. Validate migration/recovery and release v0.6 data core.
6. Validate configured-provider image/vision flows and release v0.7.
7. Validate v0.8 cross-module voice, navigation, CGM local/demo and extension UI.
8. Merge each package in order and allow the existing one-click updater to deliver the stable releases.

## Acceptance tests

- [ ] Security/dependency verification passes.
- [ ] Renderer build passes.
- [ ] Windows installer builds.
- [ ] "Mennyi a cukrom?" returns the latest stored BloodSugar value without an AI key.
- [ ] If no glucose record exists, Jarvis says no data is available rather than inventing a value.
- [ ] Demo CGM readings are visibly and verbally marked as simulated.
- [ ] Direct CGM Bluetooth cannot start unless experimental mode is explicitly enabled.
- [ ] "Vigyél haza" finds a saved home location and starts the existing navigation session.
- [ ] Saved-location navigation fails cleanly when coordinates are missing.
- [ ] Explicit "Hívd a 999-et" attempts OS call handoff without claiming the call connected.
- [ ] Merely mentioning "999" does not trigger a call.
- [ ] Image Editor voice undo/redo/zoom works in the active image context.
- [ ] Image generation from the Image Editor uses the real GenerateImage path.
- [ ] Canvas clearing returns a confirmation-required response instead of executing immediately.
- [ ] OBD scan percentage is based on elapsed scan progress, not randomness.
- [ ] OBD scan reads remain serialized/sequential.
- [ ] Extensions card lists built-in capability modules.
- [ ] Disabling an optional extension changes preference only; required core cannot be disabled.
- [ ] No extension registry path evaluates remote JavaScript.

## Commercial-release note

This package creates the reusable integration architecture and several working contextual flows. It does not by itself certify universal OBD hardware, a live Libre/Dexcom API connection, direct emergency telephony on every Windows PC, or manufacturer-specific ECU coding. Those claims require provider/hardware/platform validation.
