# Jarvis language and runtime audit — 2026-10-11

The baseline Windows workflow is green, but interface translation is incomplete. This report accompanies the v0.3.32 review candidate; it does not mark it as a published release.

## Verified baseline

[Windows run #941](https://github.com/bigzsorzs-sketch/jarvis-windows-v0.1/actions/runs/37939259201), commit `0fe493abd6c9a79a549aa28488807c529eb4bf39`: CodeQL and Windows packaging/install checks passed. All 438 Windows source tests passed. The installed app completed 33 route × 42 language-state operations (1386), checked native/local language persistence and retained English through reload. The original baseline invoked controls through DOM click, which does not prove pointer reachability. All recorded HTML document languages stayed `en`; the new candidate corrects that and adds real pointer hit testing.

The published v0.3.31 application source remains on its previously approved release. The language-audit baseline adds testing, not completed translations.

## Confirmed problems and candidate fixes

- Language writes could race; a late startup read could overwrite a new selection; corrupt local preferences blocked native hydration. The new controller serializes saves, rejects unsupported codes and reports failures without losing the UI selection.
- Date/number displays used Hungarian or machine-default locale. The affected views now use the selected locale; existing OBD history is formatted at render time so its timestamps change with the language without reading the hardware again.
- The mobile More-menu language list opened below a control near the bottom edge. It now opens upwards. Desktop pages receive their own language control.
- Language recognition counted at most one marker per language, favoured Hungarian on ties and mishandled accented word boundaries. It now counts Unicode words, requires a clear winner and validates provider output. Selected-language fallback survives an unavailable provider.
- Legal topic state cached a translated label, and a provider failure left loading enabled. Topic identifiers now survive a language change and failure clears loading.
- Fuel inputs were cleared before a failed save; invalid/nonfinite input and concurrent submissions needed protection. Validation, acknowledgement checks and failure handling preserve input and prevent false success.
- Corrupt/blocked optional tutorial preferences could crash a route or block dismissal. Recovery is now covered by regression tests. The OBD vehicle modal now has a cancel button.

Currency units, personal/user content, product names and stored identifiers are preserved. This change does not convert HUF/GBP data or automatically translate existing notes, answers or example voice commands.

## UI catalog coverage

| Language | Catalog keys | Missing English catalog keys |
|---|---:|---:|
| Hungarian | 498 | 0 |
| English | 498 | 0 |
| German | 404 | 94 |
| French | 404 | 94 |
| Spanish | 404 | 94 |

These counts describe the dictionaries, not complete visible-page translation. Hardcoded labels are outside the dictionary. The other 37 choices fall back to English: `it`, `ro`, `pl`, `pt`, `nl`, `sv`, `no`, `da`, `fi`, `cs`, `sk`, `hr`, `sr`, `bg`, `uk`, `ru`, `tr`, `ar`, `he`, `fa`, `hi`, `bn`, `zh`, `ja`, `ko`, `th`, `vi`, `id`, `ms`, `tl`, `sw`, `af`, `el`, `lt`, `lv`, `et`, `sl`.

Known remaining translation work includes Holding overview/detail/forms and tutorials, retail forms, OBD headings/VIN form, privacy/terms, memory/security descriptions, settings, image-editor labels/drawers, release checklist, voice help and admin feedback. Some pages contain Hungarian/English conditionals and therefore fall back to English in German/French/Spanish even when a catalog exists. An English page with zero matched Hungarian literals is not automatically fully translated.

The source report follows route/component imports and records UI-text candidates and locale calls. It includes 104 reachable files and 580 literal candidates at this checkpoint. Candidate counts include names, units and example commands; they are not a count of confirmed translation defects. Dynamic/lazy imports within a component, provider output and every possible data/error branch still need separate review.

## Candidate verification

The full local source suite passed: 454 tests, 452 passes, 0 failures, 2 Windows-only skips. All 471 source files parsed. Lint, the limited TypeScript check, 16 signed core rules and Vite build passed. Linux skips two Windows-only native-helper tests; Windows CI must run them. An expanded check covers undefined variables, duplicate keys, unreachable code and constant conditions in 455 JS/JSX/CJS/MJS files. The TypeScript configuration includes only `src/**/*.ts`; passing it does not prove JSX type safety.

The exact candidate's Windows workflow must provide the following results. Its final run and outcome are recorded in the accompanying pull request; this section describes required coverage, not a substitute for completed Windows evidence.

- All 33 routes and 42 language choices, using real mouse events, native/local persistence checks, document language/direction and reload (1386 operations).
- 32 passive nested views in all five available catalogs (160 checks): finance and retail tabs/forms; holding and business-detail tabs/forms; invoice, contact, phone-options, device, routine and vehicle forms; five mobile image-editor drawers.
- Six desktop routes × German/English controls (12 checks).
- Unhandled renderer exception capture, plus the existing native financial/Gmail configuration, NSIS install, packaged toolchain/admin helper, startup, restart, persistence and uninstall checks. The audit never submits its new forms, sends mail, initiates AI, dials phones or controls devices.

| Route | Component | Language choices required |
|---|---|---:|
| `/` | `Chat` | 42 |
| `/chat` | `Chat` | 42 |
| `/muszerfal` | `Muszerfal` | 42 |
| `/memoria` | `Memoria` | 42 |
| `/eszkozok` | `Eszkozok` | 42 |
| `/beallitasok` | `Beallitasok` | 42 |
| `/tools/finance` | `FinanceTool` | 42 |
| `/tools/invoices` | `InvoiceTool` | 42 |
| `/tools/calendar` | `CalendarTool` | 42 |
| `/tools/translate` | `TranslateTool` | 42 |
| `/tools/quick` | `QuickActions` | 42 |
| `/tools/image-editor` | `ImageEditor` | 42 |
| `/jelentesek` | `Jelentesek` | 42 |
| `/contacts` | `Contacts` | 42 |
| `/reminders` | `Reminders` | 42 |
| `/smarthome` | `SmartHome` | 42 |
| `/routines` | `Routines` | 42 |
| `/holding` | `Holding` | 42 |
| `/legal` | `Legal` | 42 |
| `/privacy-terms` | `PrivacyTerms` | 42 |
| `/release-checklist` | `ReleaseChecklist` | 42 |
| `/automotive` | `AutomotiveDiagnostics` | 42 |
| `/retail` | `Retail` | 42 |
| `/gmail` | `GmailManager` | 42 |
| `/locations` | `LocationsPage` | 42 |
| `/habits` | `HabitsPage` | 42 |
| `/obd2` | `OBD2Scanner` | 42 |
| `/fuel-tracker` | `FuelTracker` | 42 |
| `/voice-help` | `VoiceCommandHelp` | 42 |
| `/ai-feedback-admin` | `AiFeedbackAdmin` | 42 |
| `/system-center` | `SystemCenter` | 42 |
| `/live-assistant` | `LiveAssistant` | 42 |
| `*` | `PageNotFound` | 42 |

## Dependencies and acceptance limits

Compatible lockfile updates affect only concurrently, http-cache-semantics, shell-quote and source-map-js. `npm audit --omit=dev` reports 0 known findings. The full audit reports 15: 10 moderate, 5 high, 0 critical. Development-toolchain findings remain; the toolchain is also relevant to packaged self-repair. A forced Tailwind/builder migration is not part of this candidate.

Real AI-provider output, Google consent/Gmail delivery, microphone/audio, CGM, GPS and OBD/smart-home hardware were not accepted by these automated tests. The Windows runner is an isolated test profile, not a test on the owner's PC or mobile installation. No finite test run establishes that every possible bug is absent. Complete UI translations remain open even if every technical test is green.
