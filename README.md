# Jarvis Desktop

Local-first Windows 10/11 desktop assistant derived from the original NexusAI/Jarvis application.

## Core design
- No external builder-platform SDK dependency.
- Electron desktop runtime with Windows system context bridge.
- Signed immutable Core Rules checked at startup.
- Owner Override is permitted only for operational rules, requires a locally configured PIN and produces an action-bound, expiring, one-use grant.
- AI models never receive direct privileged operating-system access; privileged actions pass through the Jarvis Policy Engine.
- Sensitive personal context sent to an external AI service requires explicit user confirmation.
- Multi-model AI through OpenRouter with a dynamically retrieved model catalogue.
- API keys are stored only through Electron safeStorage/Windows DPAPI; Jarvis refuses insecure fallback storage.
- The application runs with the invoking user's normal Windows privileges. Installer elevation is separate and used only when Windows requires it.
- The Windows build operates in local single-owner mode. Gmail has a native OAuth connector; the owner must configure a Google Desktop OAuth client and grant access before use. Cloud sync remains unconfigured. Recorded-audio STT and TTS use the native OpenRouter bridge and require an API key, a compatible model and working microphone/audio permissions.
- Paid retail sales, stock, returns and invoice payments use atomic SQLite transactions and persistent operation receipts. Business summaries use the current month's GBP cash ledger; they do not substitute projections or unpaid invoices for received revenue.
- Responsive layouts and touch controls provide a foundation for mobile adaptation. This repository does not yet contain an Android/iOS wrapper or a validated standalone mobile voice/backend integration.
- Updates require SHA-256 integrity validation and matching valid Authenticode signer identity.

## Languages
The installer includes English, Hungarian, German, French, Spanish, Italian, Portuguese, Polish, Romanian, Dutch, Russian and Simplified Chinese. The existing Jarvis UI language system remains extensible beyond these installer languages.

## Build
1. Install the supported Node.js version.
2. `npm ci` when `package-lock.json` is present.
3. `npm run desktop:build`

Output: `release/Jarvis-Setup-<version>-x64.exe`

## Release validation
GitHub Actions runs syntax checks, source/regression tests, lint, TypeScript checks for typed source, production dependency audit, signed-rule verification, renderer build, Windows installer build and packaged checks. It then installs the actual NSIS package, exercises the real preload/IPC/policy/SQLite path, loads the retail, invoice, finance, Holding and Gmail screens, verifies persistence after restart and uninstalls the app before generating the installer checksum.

The [integration review](docs/integration-review-2026-10-08.md) records the repaired execution/upload paths and the remaining integration and physical-device checks. Passing automated tests is not evidence that every external service or device works.

The [Windows product acceptance guide](docs/windows-product-acceptance.md) describes the supported financial workflow, Gmail setup, legacy-data handling and the live checks needed before buyer handover. The older dated review is a historical record; the acceptance guide describes the current implementation.
