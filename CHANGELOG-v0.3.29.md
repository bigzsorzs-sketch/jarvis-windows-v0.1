# Jarvis v0.3.29 — Instruction-Driven Local Self-Repair

Cumulative Windows update based on v0.3.28.

## Self-Repair follows the owner request

- Self-Repair no longer starts a general bug hunt or broad code audit on its own.
- “Check/inspect” requests inspect only the requested scope.
- Concrete problem reports are traced through the relevant source and return a targeted diagnosis and repair proposal.
- Code changes are prepared only when the owner explicitly asks to fix, change, add, remove or implement something.
- The prompt explicitly requires Jarvis to do only the requested task and nothing broader.

## GitHub Self-Repair removed

- Removes the GitHub Self-Repair connection panel and token input from System Center.
- Removes the renderer GitHub Self-Repair bridge and all Self-Repair GitHub IPC channels.
- Removes GitHub Self-Repair token storage, PR creation, merge, abandon and release-publication logic.
- Deletes the obsolete electron/github-self-repair.cjs module.
- Legacy Self-Repair token fields are cleaned from local settings without exposing the old token through the renderer.
- Normal stable-update manifest verification remains independent in electron/release-manifest.cjs.

## Simpler Self-Repair conversation

- Removes the “Hibák keresése / Find bugs” button.
- Removes automatic project-wide findings from ordinary Self-Repair chat responses.
- Updates examples to reflect direct requests such as checking a subsystem, investigating a specific disappearing conversation, or explicitly fixing a problem.

## Accept now applies locally

- “Elfogadom / Accept” remains bound to the exact hashed repair proposal.
- Native owner confirmation is required before source mutation.
- Jarvis creates a backup in its isolated local Self-Repair workspace.
- The exact patch is applied and normalized.
- Direct source validation and the complete local validation suite must pass.
- The full gate includes locked dependency install, production dependency audit, all-source parse, lint, typecheck, Jarvis verification, source tests and renderer build.
- Only after every gate passes is the repaired local runtime activated and Jarvis restarted into it.
- Any validation/build failure removes activation state and restores the backup.
- A later installed version invalidates an older repaired runtime through version/source fingerprint checks.

## Scope

This release removes GitHub from the Self-Repair feature. The normal application updater may still use the configured stable release source to download verified installers; its SHA-256, manifest and release-target checks remain intact.
