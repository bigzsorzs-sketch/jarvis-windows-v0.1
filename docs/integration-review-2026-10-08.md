# Jarvis integration review — 8 October 2026

Reviewed version: **0.3.29**, starting at commit `f2ffe803c63bd80314fc75c0d538d53088584384`.

The execution and file-upload paths contained reproducible integration defects. This change repairs those paths and adds runtime regression coverage. It does **not** establish that every module, external provider, physical device or mobile platform is ready for production.

## Repairs in this change

| Path | Reproduced problem | Resulting behavior |
| --- | --- | --- |
| Planner | `makePlan` referenced an undeclared `source`; the router swallowed the exception. | Chat, voice and live requests pass their source to the planner. Planning errors produce an honest failure/partial result. |
| Command routing | Single-intent commands and the voice fallback could consume a multi-step request before the planner. | Recognized multi-step requests reach the planner before those routes; simple requests retain direct routing. |
| Plan validation | Empty, malformed or merely claimed `done` plans were treated as success. | Validate status, step count, unique IDs and parameters before execution. Completion requires actual verified step receipts. |
| Result verification | Missing tool results, cancelled actions and absent acknowledgements could count as success and teach successful operational memory. | Require boolean `success:true`, honor blocking and reject unverified live state. Optional `expected_result` fields distinguish an email draft from a required send result. |
| Dependencies | A PDF step could not obtain the ID of an invoice created by a preceding step. Later steps also ran after failed prerequisites. | Resolve bounded, own-property references such as `{"$ref":"invoice.data.id"}` from verified prior results. Stop at the first failed prerequisite. |
| Recovery | A replan or executor retry could repeat a write that had already committed. | Retain completed receipts, reuse completed actions on recovery, reject changed completed IDs, and automatically retry only explicitly classified read-only operations. Preserve partial results on provider failure. |
| AI text screens | Quick actions, translation, retail insights and ecosystem insights stored the complete API envelope as display text. Provider errors left the busy state set. | Normalize the actual native `data.result` envelope and release busy state on success and failure. |
| Uploads | Image tools and receipt scanning sent `FormData` or `{file}` to a native validator expecting a data URL; multi-image upload expected a nonexistent `data.success` field. | All affected screens and canvas uploads use `Core.UploadFile`: FileReader → native validator → checked URL. A refused upload prevents generation/analysis. |
| Style transfer | The default layer target required a mask and could choose a hidden last layer. | Layer styling works without a mask, uses the last visible source layer, and refuses an empty source. |
| Static checks | ESLint omitted the libraries containing the undeclared planner variable. | Add `no-undef` coverage for renderer libraries, API adapters and hooks. |

Affected upload callers: `MultiImageUpload`, `AIEnhancePanel`, `AIMaskPanel`, `OutpaintPanel`, `StyleTransferPanel`, `FinanceTool` receipt scanning and `uploadCanvasAsFile`.

## Verification and its limits

The existing suite passed before the repairs despite the planner defect. New tests execute the real source modules, rather than only checking for text patterns.

- **40 new test cases**, including chat and voice invoice → actual PDF generation → note creation through the real router, planner, executor, operational memory and local data adapter.
- Full suite: **416 tests: 414 passed, 2 Windows-only tests skipped, 0 failed** on Linux.
- Syntax audit: **458/458** source files parsed. Syntax validity alone is not runtime verification.
- ESLint, the existing limited TypeScript check, production renderer build and signed-core-rule verification passed.
- Production dependency audit reported **0 vulnerabilities** at the time of this review.

The workflow integration test substitutes the AI response and browser download boundary. The upload tests substitute FileReader/canvas and native IPC transport but run the real upload adapter and native validation function. No paid AI request, real email, phone call, device command or live patient measurement was sent by these tests.

The local environment installed dependencies with lifecycle scripts disabled. The successful renderer build does not validate an Electron/SQLite native binary, Windows installer, DPAPI, microphone, UAC prompt or production signing. Windows CI and a real Windows session remain separate checks. The two skipped tests cover the Windows updater/bootstrap paths.

## Remaining work

| Priority | Area | Concrete remaining work | Can code changes alone finish it? |
| --- | --- | --- | --- |
| 1 | Windows and actual AI | Run the built application on Windows 10/11 with a configured OpenRouter account. Exercise real model plans, microphone permission, STT, TTS, approval cancellation, restart/persistence and provider outages. Save a short reproducible demonstration. | No; implementation fixes are possible here, but the final acceptance check needs Windows, audio and provider access. |
| 1 | B2B financial data flow | `RetailSale` recording and stock updates are separate writes. They do not automatically create a `FinanceEntry`; ecosystem business totals use `Business.revenue_monthly`/`expense_monthly`, not a consolidated retail ledger. Define business ownership, accounting period and duplicate prevention, then implement an atomic sale/stock/ledger operation and reconciliation tests. Invoice creation must not be confused with payment receipt. | The implementation is feasible, but the intended accounting/data model must be specified. Current screens are not a fully reconciled accounting system. |
| 2 | Gmail | Native `gmailFetch`/`gmailSend` still return `GMAIL_OAUTH_NOT_CONFIGURED`; connector setup throws. Implement a real OAuth connector, scoped authorization, token storage/refresh, fetch/send and attachment handling. Validate against a test mailbox. | No; this is missing implementation plus provider/account setup, not merely a missing API key. The existing fallback opens a mail draft and does not send or attach the PDF automatically. |
| 2 | Mobile | Responsive/touch components exist. Add an Android/iOS wrapper/build target, replace Electron-only bridges, implement platform-appropriate secure storage/audio/notifications and validate on devices. | Code work is feasible; installable mobile packages, signing and device acceptance are still required. There is no completed native mobile app in this repository. |
| 2 | OBD and smart home | Native serial/Wi-Fi OBD and policy-gated local-device paths exist. Validate actual adapters/devices, disconnects, permissions, timeouts and observed physical states. | No; final verification requires the corresponding hardware and network. |
| 3 | CGM sensor connection | Direct sensor connection is deliberately disabled pending a documented/official data path and physical validation. Implement the selected supported connector and validate units, timestamps, missing/stale readings and disconnections. | No; a connector choice and real data/device evidence are required. Manual glucose recording is a different feature. |
| 3 | Background sync/notifications | Cloud sync is unconfigured. Current notification scheduling relies on the running application; closed-app/mobile background delivery needs a platform/backend path. | Backend/platform code can be built, but deployment and lifecycle testing are also needed. |
| 3 | Self-Repair and update acceptance | Perform a real Windows preview → approved patch → verification → restart/rollback exercise and signed update round trip. The immutable-core restrictions are intentional, not an integration defect to remove. | No; unit/simulated IPC coverage does not prove an installed-app repair/update cycle. |

The planner still deliberately uses a bounded registry of Jarvis tools. Registering a module name does not implement arbitrary operating-system automation or a connector for every page. This review repairs the workflows covered above; it is not an exhaustive manual test of every screen.

## Demonstration before buyer review

Use a clean test profile and non-sensitive fixture data. Record one simple note, one multi-step invoice/PDF/note workflow, one receipt scan and one image operation. Then demonstrate a cancelled confirmation and an unavailable provider: the app should retain earlier completed steps and report the incomplete operation accurately. For the voice demonstration, use a real microphone and provider result rather than injected test plans.

Describe unsupported integrations and mobile status explicitly in the sale listing. This change remains a source-code repair until it is reviewed, built and installed; it does not update an already installed 0.3.29 application.
