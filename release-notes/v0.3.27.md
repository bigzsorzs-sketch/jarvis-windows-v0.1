# Jarvis v0.3.27 — Unified Tool Routing

Cumulative Windows release based on the audited v0.3.26 codebase. Install v0.3.27 directly; earlier v0.3.x releases do not need to be installed first.

## Unified text and voice execution

- Keeps the existing single assistant routing path and extends it so Live Assistant voice and typed commands can reach the same guarded tool executor.
- Voice-planned actions execute through `executeActions`, preserving the capability registry and confirmation rules for sensitive operations.
- Existing chat confirmation remains in place for invoices, email, calls and physical device control.
- Complex requests still fall back to the LLM/agent routing rather than being forced through brittle keyword shortcuts.

## Fast deterministic commands

- Explicit Google Maps requests can open the requested destination directly.
- Latest blood-sugar readings can be read directly from the local Jarvis data store.
- Blood-sugar logging accepts decimal values such as `5.5` and `5,5`.
- Missing map destinations or glucose values produce a clarification instead of inventing data.
- Generic commands such as “open settings”, phone calls, invoices and smart-home operations are deliberately not hijacked by the fast intent layer.

## Tool coverage

- Adds `open_map` and `read_latest_blood_sugar` as classified instant capabilities.
- Adds `create_invoice_and_email` as a confirmation-required combined capability.
- Preserves the existing meal, finance, translation, smart-home, ecosystem, workload and revenue tools from v0.3.26.
- Existing UK finance and invoice output remains in pounds.

## Safety and regression fixes

- Removes the draft behavior that could treat unrelated “open” commands as maps.
- Prevents blood-pressure or generic health questions being misclassified as blood-sugar reads.
- Prevents decimal glucose values from being truncated to integers.
- Prevents deterministic shortcuts from bypassing confirmation for calls, invoices, email and physical device control.
- Restores the full scoped system prompt, sensitive-context handling and capability approval instructions from the audited baseline.

## Verification

Publication is allowed only after the exact release commit passes the repository Windows pipeline: CodeQL, full source parsing, source tests, lint, TypeScript checks, production dependency audit, Jarvis policy verification, renderer build, Self-Repair toolchain staging, NSIS installer build, packaged toolchain checks, admin-helper handshake, Windows startup smoke test, SHA-256 generation and release-manifest verification.

Real microphone hardware, external providers and physical smart-home bridges still require hands-on acceptance testing on Windows.

Unsigned publication requires explicit owner approval.
