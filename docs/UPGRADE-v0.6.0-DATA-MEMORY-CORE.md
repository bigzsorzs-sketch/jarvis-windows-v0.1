# Jarvis v0.6.0 Durable Data + Memory Core

Status: staged on `develop/v0.6.0-data-memory-core`.

## Purpose

Move Jarvis' desktop data away from browser localStorage into a durable, versioned Electron-side data store without changing the public entity API used by the existing UI.

The goal is to make memories, vehicle history, diagnostics, reminders, finance data and other local records survive crashes and future upgrades more reliably.

## Included

- Versioned Electron local data store under Jarvis user-data.
- One JSON document per entity type.
- Atomic temp-file writes.
- Last-good `.bak` copy before valid data is replaced.
- Automatic recovery from the backup if the primary JSON becomes unreadable.
- Path-safe entity names.
- Electron IPC CRUD operations:
  - filter,
  - create,
  - update,
  - delete,
  - local user read/update.
- One-time migration from the existing localStorage entities into the desktop store.
- Migration is non-destructive: old localStorage data is kept as a fallback.
- Browser/dev mode keeps the existing localStorage implementation.
- Existing `jarvis.entities.*` callers do not need to be rewritten.

## Data architecture

`UI modules -> jarvisClient entity API -> isolated preload IPC -> Electron durable data store -> versioned JSON + backup`

This gives later packages one stable place for:
- conversation memory,
- vehicle history,
- OBD sessions,
- health demo/provider records,
- plugin state,
- user settings that belong in entity storage.

## Recovery behaviour

Before replacing a valid entity document, Jarvis copies the previous valid file to `.bak`.

If the primary file cannot be parsed on the next read, Jarvis attempts to load the backup and records a recovery event in the stability log.

## Upgrade path

1. v0.3 stability release gate must pass.
2. v0.4 contextual voice must pass.
3. v0.5 OBD reliability must build and complete its supported-hardware smoke test.
4. Install v0.6 on a copy of a real user profile with existing Jarvis localStorage data.
5. Verify migration before releasing.
6. Merge and publish `Jarvis-Setup-0.6.0-x64.exe`.
7. Existing Jarvis installations receive it through the one-click updater.

## Acceptance tests

- [ ] Security/dependency verification passes.
- [ ] Electron syntax checks pass.
- [ ] Renderer build passes.
- [ ] Windows installer builds.
- [ ] Fresh install creates the data directory on first entity write.
- [ ] Existing localStorage user is migrated once.
- [ ] Existing Memory rows migrate with IDs/content intact.
- [ ] Existing VehicleProfile and OBDSession rows migrate intact.
- [ ] Existing reminders/tasks/finance records migrate intact.
- [ ] New entity creates go to the Electron data store on desktop.
- [ ] Updates survive full app restart.
- [ ] Deletes survive full app restart.
- [ ] Corrupting a primary entity JSON recovers from its valid backup.
- [ ] Failed migration does not delete old localStorage data.
- [ ] Browser/dev fallback continues to work without Electron.
- [ ] v0.5 -> v0.6 one-click update preserves user records.

## Deliberately not included

Cloud sync, multi-device conflict resolution and third-party account sync are not part of this package. They should sit on top of this local durable layer rather than replacing it.
