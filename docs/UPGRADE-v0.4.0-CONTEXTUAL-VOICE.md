# Jarvis v0.4.0 Contextual Voice + Situation Layer

Status: staged on `develop/v0.4.0-contextual-voice`.

## Purpose

Turn Jarvis from a collection of separate screens into one assistant that can understand the active situation and route a natural spoken request to the right existing function.

This release is intentionally built on top of v0.3.0 stability/self-repair. It must not bypass the v0.3 release gate.

## Included

- Central capability bus for active Jarvis modules.
- Active-module context available to the voice/action layer.
- Situation-aware command router:
  - deterministic low-latency routing for common commands,
  - optional AI routing when an API provider is configured,
  - graceful fallback when no API key is present.
- Safety metadata for capabilities:
  - read-only actions can execute immediately,
  - future write/dangerous actions can require explicit confirmation.
- Automotive module registered as the first deep contextual module.
- Hands-free OBD read actions:
  - read current DTCs,
  - read RPM,
  - read coolant temperature,
  - read MAF,
  - read vehicle speed,
  - capture OBD snapshot,
  - compare current OBD state with the previous snapshot.
- Passive OBD baseline captured after connection, allowing natural follow-ups such as:
  - "Nézd meg, változott-e valami."
  - "Eltűnt a hibakód?"
  - "Mennyi most a hűtővíz?"
- Spoken automotive replies through the central voice runtime.
- No dependency on a configured AI key for the deterministic OBD voice commands.

## Architecture

`Voice/Text -> Situation Orchestrator -> Active Module Context -> Capability Bus -> Safe Action -> Spoken/Text Reply`

The same capability bus is designed to be reused by navigation, images, files, email, health/CGM and later plugins.

## Safety boundary

This release only registers read-only OBD actions.

Any future action that can alter data, clear DTCs, trigger actuators, send messages, make purchases, or perform other consequential writes must be registered with a confirmation requirement and must not execute from an unconfirmed natural-language command.

## Upgrade path

1. Install and smoke-test v0.2.0 on a real Windows PC.
2. Merge/release v0.3.0 stability only after its acceptance test passes.
3. Test this branch against the released v0.3.0 state.
4. Merge v0.4.0 to main.
5. GitHub Actions builds `Jarvis-Setup-0.4.0-x64.exe`.
6. Installed Jarvis receives it through the existing one-click updater.

## Acceptance tests

- [ ] `npm run verify:jarvis` passes.
- [ ] Renderer build passes.
- [ ] Windows installer build passes.
- [ ] Jarvis opens with no API key configured.
- [ ] Voice runtime starts and stops without a restart loop.
- [ ] Automotive page registers as the active contextual module.
- [ ] With no OBD adapter, contextual OBD commands fail cleanly rather than crashing.
- [ ] With a supported adapter connected, "olvasd újra a hibakódokat" returns current DTCs.
- [ ] "mennyi az RPM" returns a live RPM value.
- [ ] "nézd meg, változott-e" compares against the previous OBD snapshot.
- [ ] Automotive voice replies are spoken when auto-speak is enabled.
- [ ] AI-based contextual routing gracefully falls back if no API key is configured.
- [ ] No OBD write/clear/actuator command is available in this release.

## Next packages

- v0.5: OBD transport/reliability + Windows-native adapter support.
- v0.6: memory/data core and durable local storage.
- v0.7: image/file/tool runtime.
- v0.8: connector/device reliability including navigation and health integration layers.
