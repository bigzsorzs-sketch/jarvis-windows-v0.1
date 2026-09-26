# Google Play Data Safety – Jarvis Assistant

## Likely collected data categories
- Personal info: email, name, account settings
- Health and fitness: blood sugar, meals, medication, sensor data
- Financial info: invoices, finance records
- Contacts: contact names, phone numbers, emails
- Location: saved places, route history, live navigation/session location
- Audio: microphone input / voice commands
- App activity: actions, reminders, feature usage
- Device or other IDs: authentication/session/platform identifiers

## Sensitive data handling
This app may process sensitive categories including:
- Health data
- Financial data
- Contacts data
- Precise or approximate location
- Audio input
- Bluetooth / OBD / sensor data
- Gmail / Calendar connected account content when enabled

## Why data is collected
- App functionality
- Personalization
- Account management
- Analytics / diagnostics / security
- Fraud or abuse prevention

## Data sharing
Potential third-party sharing/processing may occur for:
- AI request processing
- Connected provider APIs (for example Gmail or Calendar)
- Platform infrastructure and storage

## Encryption
- Data should be treated as encrypted in transit
- Sensitive access should be limited to authenticated users

## User rights / controls
- In-app record deletion
- Account deletion support
- Data export support

## Retention
Data may be retained until user deletion, export, account deletion, or operational/legal necessity.

## Release checklist before Play submission
- Verify actual production behavior matches every disclosure
- Verify permissions requested in Android wrapper match disclosures
- Publish a public privacy policy URL
- Re-check all connected integrations and AI processors