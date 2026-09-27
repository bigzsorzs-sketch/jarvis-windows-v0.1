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
- The Windows build currently operates in local single-owner mode. Gmail OAuth, cloud sync and recorded-audio STT are shown as unavailable until a real backend is configured.
- Updates require SHA-256 integrity validation and matching valid Authenticode signer identity.

## Languages
The installer includes English, Hungarian, German, French, Spanish, Italian, Portuguese, Polish, Romanian, Dutch, Russian and Simplified Chinese. The existing Jarvis UI language system remains extensible beyond these installer languages.

## Build
1. Install the supported Node.js version.
2. `npm ci` when `package-lock.json` is present.
3. `npm run desktop:build`

Output: `release/Jarvis-Setup-<version>-x64.exe`

## Release validation
GitHub Actions runs syntax checks, source/regression tests, lint, TypeScript checks for typed source, production dependency audit, signed-rule verification, renderer build, Windows installer build, packaged EXE startup smoke test and SHA-256 generation.
