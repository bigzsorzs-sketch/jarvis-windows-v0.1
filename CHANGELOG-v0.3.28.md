# Jarvis v0.3.28 — Unified Command Runtime

Cumulative Windows release based on v0.3.27. Install v0.3.28 directly.

## One command path for text and voice

- Typed Chat commands and spoken commands now reuse the same global UI command resolver.
- Natural requests can open Jarvis pages such as Tools, Settings, Gmail, OBD2, invoices and finance without requiring a separate voice-only path.
- Hungarian variants such as “eszköztár” and “eszköztárat” are recognized for the Tools page.
- Safe deterministic map and glucose commands remain ahead of generic UI routing.

## Real Live Assistant

- `/live-assistant` now loads the actual `LiveAssistant` component instead of routing back to normal Chat.
- The global voice overlay is disabled on the Live Assistant route so one transcript is not owned by two independent voice handlers.
- Live Assistant executes the same resolved UI command objects as normal Chat.

## Broader Jarvis data search

- `search_data` now searches core productivity, finance, health, smart-home, business, vehicle, retail, location and route-history entities.
- If an entity does not support the normal search endpoint, Jarvis falls back to owner-scoped local matching instead of aborting the whole search.

## Calls

- `call_contact` now resolves a saved contact by name when a phone number was not supplied.
- Jarvis no longer reports a successful call start when no phone number can be found.

## Invoice → PDF → email

- `create_invoice_and_email` now creates the invoice, generates the PDF, then prepares the email in that order.
- PDF generation returns its exact filename for downstream workflow status.
- If Gmail OAuth is configured in the future, direct delivery can be used by the email tool.
- In the current desktop backend Gmail OAuth is not configured, so Jarvis honestly opens the email composer and tells the user the generated PDF still needs to be attached. It never falsely reports an attachment or send.

## Safety

- Existing confirmation requirements remain for calls, invoices, email and physical device control.
- Smart-home commands still require verified physical device state before Jarvis records success.
- Existing v0.3.27 glucose, map, Self-Repair, updater and release-manifest protections remain in place.

## Verification

The exact release commit must pass CodeQL, source parsing, tests, lint, TypeScript checks, dependency audit, Jarvis verification, renderer build, Self-Repair staging, NSIS build, packaged checks, admin-helper handshake, Windows startup smoke test, SHA-256 generation and release-manifest verification before publication.

Unsigned publication requires explicit owner approval.
