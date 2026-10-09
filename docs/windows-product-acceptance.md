# Windows product acceptance

Candidate version: **0.3.31**. This guide defines what can be demonstrated and what still requires real provider/device evidence. A passing build is not a claim that all integrations have completed acceptance.

## Supported financial workflow

This is a local single-owner, **GBP cash ledger**. It is not a complete accrual-accounting, VAT, payroll or payment-processing product.

1. Create a business in Holding. The manually supplied revenue/expense figures are estimates; the current dashboard totals come from recorded cash movements.
2. Associate a retail product with that business and enter its GBP price, cost and stock.
3. Record a sale only after payment is received. A single immediate SQLite transaction creates the sale, reduces stock, creates the linked company income and saves the operation receipt. Failure rolls all four back. Replaying the same operation ID returns its existing receipt; changed parameters conflict.
4. Sale revenue includes the discount. Gross profit subtracts the full cost of the sold goods. Cost of goods is kept on the sale and is not also booked as a cash expense, which would double-count separately recorded inventory purchases.
5. A return records restored stock, a compensating cash refund and the voided sale in one transaction. It does not erase the original income. Confirm the goods and money have actually been returned; Jarvis does not transfer money.
6. Creating an invoice does not record income. Mark it paid only after payment is received; this creates one linked company income and locks its paid financial fields. Do not also record a separate retail cash sale for the same payment.
7. Manual finance entries can be assigned to a business. Personal entries and other months are excluded from company-month totals. Unassigned company entries appear in the ecosystem total and are identified separately. Holding's per-business figures include only that business's linked ledger entries.

Currency, money precision, quantities, calendar dates and business references are validated natively. Unsupported currencies are refused rather than silently treated as GBP. Linked income/refund entries cannot be edited or deleted independently of their source operation. Historical stocktakes require the stock value observed by the screen, preventing an outdated count from overwriting a later sale.

### Existing data

Old sale rows and already-paid invoices do not prove that cash was previously received or whether it was entered manually. They are **not automatically backfilled into income**, which could duplicate real money. Compare them with the existing ledger and bank/cash records before recording missing entries. Returning an old unmanaged sale or paying an old paid invoice requires reconciliation; the app refuses to invent a linked payment.

SQLite backups preserve operation receipts together with the associated records. Restoring an older backup cannot undo an external payment or email. Reconcile external events occurring after that backup before resuming them.

## Gmail setup and behavior

1. In the owner's Google Cloud project, enable the Gmail API and configure the OAuth consent screen.
2. Create an OAuth client of type **Desktop app**. Supply its client ID in Jarvis's Gmail screen and, if Google supplies/requires it, its client secret. These are application credentials; Jarvis never asks for the user's Google password.
3. Click Connect. The system browser handles Google sign-in and consent. A temporary listener bound to `127.0.0.1` receives the authorization code with state validation and PKCE. Read and send scopes are explicit; OpenID identifies the authorized account.
4. Refresh/access tokens and the optional client secret are encrypted using Electron safeStorage / Windows DPAPI. No plaintext fallback is used. Disconnect clears local credentials even if Google's revocation endpoint cannot be reached; the UI then asks the owner to review Google account permissions.
5. The Gmail screen displays authenticated inbox metadata/snippets. Reply, star and delete management open Gmail itself. It does not present buttons that claim unsupported remote changes.
6. `draft_email` hands a draft to the configured system mail client. It never sends a message. `send_email` requires a Gmail send grant and the existing native sensitive-data confirmation. PDF invoice emails attach the actual generated PDF bytes.
7. Success requires Gmail's message ID. A timeout, missing acknowledgement or server failure can leave delivery uncertain. The receipt remains pending and the same operation ID will not send again. Check Sent Mail before intentionally starting a new send. A Gmail message ID acknowledges provider acceptance; it does not prove recipient delivery.

Public distribution may require Google's OAuth verification according to the chosen scopes and consent-screen configuration. The desktop loopback flow is not a mobile OAuth implementation.

Official setup references: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Evidence produced automatically

- Runtime tests use real SQLite for sale/stock/ledger rollback, duplicate receipts across restart and snapshot restoration, stale stocktake rejection, return compensation and invoice payment.
- OAuth tests use a real local HTTP callback, with the external Google endpoint substituted. They exercise state/PKCE, denial, timeout, refresh, cancellation, metadata, MIME/PDF bytes and uncertain send outcomes. No actual mailbox acceptance is claimed.
- Chat/voice tests exercise the real command router, planner, executor, adapter and PDF generator with the provider/download boundaries substituted.
- The Windows workflow installs the real NSIS package in an isolated directory and profile, uses the packaged renderer and normal native bridges, exercises financial writes, displays five principal screens, restarts to verify data/settings, and uninstalls. Its `Jarvis-Windows-Acceptance` artifact contains a JSON report and screenshot. This candidate must pass that check; the guide does not predeclare its result.
- CodeQL, dependency audit, immutable core rules, lint, source parsing, limited TypeScript checks, packaging and signing/checksum verification remain release gates.

## Live acceptance still required

| Area | Evidence needed before claiming it works end to end |
| --- | --- |
| Gmail | Owner-configured Google client; actual consent, inbox fetch, test-message/PDF send, expiry/refresh, cancellation and disconnect against a test mailbox. |
| AI and voice | Supported Windows machine, configured provider, real chat/voice plan, microphone permission, STT and audible TTS; provider refusal/outage and approval cancellation. |
| Backup and Self-Repair | Installed-app backup/restore with fixture data, approved patch, successful restart and failed-patch rollback; signed update round trip. |
| Windows delivery | Actual Windows 10 and 11 user sessions, installation/upgrade/uninstall and relevant permissions. Windows CI is one runner environment. |
| OBD / smart home | Corresponding real devices, live acknowledgements, disconnect and timeout behavior. |
| Mobile / CGM / closed-app notifications | Separate implementations and physical/platform acceptance. Responsive layouts are a mobile foundation, not an installable Android/iOS app. Direct CGM and cloud sync remain unavailable. |

Handover is reviewable when the installer, exact source commit, checksum, automated evidence and live acceptance results are supplied together. Unverified areas must remain named as such in the sales description.
