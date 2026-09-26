# Jarvis v0.3.0 Stability Pack

Status: prepared on `develop/v0.3.0-stability`. Do not merge to `main` until Jarvis v0.2.0 has built successfully, has been installed on a real Windows 10/11 PC, and the base install has passed the smoke test below.

## Purpose

This package is the first post-install upgrade. It focuses on resilience and recovery rather than adding risky new integrations.

## Included

- Single-instance protection: launching Jarvis twice focuses the existing window instead of starting a second copy.
- Renderer crash recovery: up to two automatic renderer reloads in a one-minute window.
- Crash-loop protection: repeated renderer failures stop automatic reload loops and are recorded for diagnosis.
- Persistent stability log under the Jarvis user-data folder.
- Process-level logging for uncaught exceptions and unhandled promise rejections.
- Stability status IPC: uptime, recent renderer restarts, last renderer crash and last unhandled error.
- Built-in self-test:
  - signed Core Rules integrity,
  - Windows encrypted safeStorage availability,
  - user-data folder write test,
  - renderer crash-loop state.
- Settings UI card for running the self-test and opening the stability log.
- Full Jarvis restart action from the error recovery screen.
- Last-good local-data snapshot: before local entity/user data is overwritten, the previous valid JSON is kept. If the current JSON becomes corrupt, Jarvis automatically attempts recovery from the last-good copy.
- Existing one-click GitHub updater remains the delivery mechanism.

## Upgrade path

1. v0.2.0 must be installed and working.
2. Verify chat opens, Settings opens, API-key storage works and the app can restart normally.
3. Merge this branch to `main`.
4. GitHub Actions builds `Jarvis-Setup-0.3.0-x64.exe`.
5. CI runs Jarvis security verification and creates SHA-256 checksum.
6. CI publishes stable release `v0.3.0`.
7. On the installed Jarvis, press **Frissítés egy kattintással**.
8. Jarvis downloads the new installer, verifies SHA-256, backs up local data, installs and restarts.

## v0.2.0 smoke test before release

- [ ] Installer completes on Windows 10/11 x64.
- [ ] Jarvis launches after installation.
- [ ] Hungarian UI starts correctly when selected.
- [ ] Settings page opens.
- [ ] OpenRouter key can be saved.
- [ ] AI chat can make one successful request.
- [ ] Microphone permission flow opens without crashing.
- [ ] Core Rules verification passes.
- [ ] Closing and reopening Jarvis preserves settings.
- [ ] One-click updater can reach GitHub releases without installing an invalid file.

## v0.3.0 acceptance test

- [ ] `npm run verify:jarvis` passes.
- [ ] Renderer build passes.
- [ ] Windows NSIS installer builds.
- [ ] SHA-256 file is produced.
- [ ] Stable GitHub release publishes.
- [ ] Starting Jarvis twice creates only one active instance.
- [ ] Stability self-test reports policy/storage/crash-loop results.
- [ ] Stability log can be opened from Settings.
- [ ] Error screen can restart Jarvis.
- [ ] Corrupted local JSON recovers from the last-good snapshot when one exists.
- [ ] v0.2.0 updates to v0.3.0 using the in-app one-click updater.

## Deliberately not included

Gmail OAuth, unrestricted system automation, automatic code self-modification, background self-updates, and large feature migrations are intentionally excluded from this stability release. They should be separate upgrades after the updater and recovery path have been proven on a real PC.
