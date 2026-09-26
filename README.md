# Jarvis Desktop

Local-first Windows 10/11 desktop assistant derived from the original NexusAI/Jarvis application.

## Core design
- No external builder-platform SDK dependency.
- Electron desktop runtime with Windows system context bridge.
- Signed immutable Core Rules checked at startup.
- Owner Override is permitted only for operational rules and only for one action at a time.
- AI models never receive direct privileged operating-system access; privileged actions must pass through the Jarvis Policy Engine.
- Multi-model AI through OpenRouter with a dynamically retrieved model catalogue.
- API keys are stored using Electron safeStorage when Windows encryption is available.
- Windows installer requests elevation and the application is configured to run elevated.

## Languages
The installer includes English, Hungarian, German, French, Spanish, Italian, Portuguese, Polish, Romanian, Dutch, Russian and Simplified Chinese. The existing Jarvis UI language system remains extensible beyond these installer languages.

## Build
1. Install Node.js LTS.
2. `npm install`
3. `npm run desktop:build`

Output: `release/Jarvis-Setup-<version>-x64.exe`
