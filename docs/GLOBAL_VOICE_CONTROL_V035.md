# Jarvis v0.3.5 — Global Voice Control

Goal: make voice a first-class control layer across the desktop app.

## Required behaviour

- Open any app page by voice (settings, calendar, finance, invoices, OBD, system center, smart home, etc.).
- Open Google Maps by voice.
- Start navigation to a spoken destination.
- Close the current view or go back by voice.
- Change safe UI state by voice (theme, sidebar, microphone off).
- Route operational requests through the existing command/action layer rather than duplicating business logic.
- Keep hands-free mode active after successful commands.

## Safety model

Read-only navigation and UI actions may execute immediately.
Actions that create, send, delete, purchase, call, control a device, or otherwise cause an external side effect must use the existing confirmation/policy layer before execution.

## Architecture

1. Global voice transcript event.
2. Local UI command resolver for navigation/map/theme/back/close.
3. Existing CommandRouter for application actions.
4. Existing assistantTools/ENV_TOOLS for supported functions.
5. Confirmation gate for side-effecting actions.
6. TTS confirmation, then resume listening.

## Acceptance examples

- "Nyisd meg a térképet."
- "Navigálj Wakefieldbe."
- "Nyisd meg a beállításokat."
- "Nyisd meg az OBD-t."
- "Menj vissza."
- "Sötét mód."
- "Nyisd meg az okosotthont."
- "Kapcsold le a nappali lámpát." -> confirmation if required by device policy.
- "Hívd fel Pétert." -> confirmation before starting an external call.
- "Készíts egy emlékeztetőt holnapra." -> existing action pipeline.

The implementation must not bypass the existing policy, confirmation, sandbox, or permission checks.
