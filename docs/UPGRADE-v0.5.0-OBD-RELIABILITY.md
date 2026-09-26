# Jarvis v0.5.0 OBD Reliability + Windows Native Transport

Status: staged on `develop/v0.5.0-obd-reliability`.

## Purpose

Make the existing automotive/OBD functions technically trustworthy enough for workshop testing on Windows.

This release does not attempt manufacturer-specific TOPDON-level coding/programming. It hardens standard OBD-II first.

## Included

- Native Electron serial bridge for Windows USB OBD adapters.
- Removes the old placeholder HTTP endpoints from `USBOBDManager`.
- Windows COM port discovery and picker.
- USB baud-rate probing (115200 / 38400 / 9600).
- Adapter identity probe before accepting a USB connection.
- Serialized serial commands so ELM responses cannot overlap.
- Connection status monitoring.
- Read-only command allow-list at the Electron boundary.
- Hardened OBD response normalization for:
  - spaces on/off,
  - command echo,
  - CR/LF variants,
  - prompt characters,
  - SEARCHING output,
  - compact hexadecimal responses.
- Correct standard DTC decoding for P/C/B/U families.
- Correct positive-response handling for Mode 04 in the shared parser.
- More robust Mode 09 VIN decoding.
- Supported-PID discovery using Mode 01 PID bitmaps.
- PID support checks before polling.
- Current adapter/COM/baud information shown in the automotive UI.
- Contextual voice/OBD functions from v0.4 remain available.

## Important safety boundary

The native serial IPC bridge only permits read-only standard diagnostic commands and AT adapter commands.

Write/actuation operations are intentionally blocked at this layer until a dedicated confirmation and safety flow exists.

This means v0.5 is aimed at:
- connection,
- identification,
- DTC reading,
- live data,
- VIN,
- supported PID discovery,
- comparison/history.

It is not an ECU coding/programming release.

## Upgrade path

1. v0.3 stability must pass its real-PC release gate.
2. v0.4 contextual voice must pass its acceptance test.
3. Test v0.5 with at least one known-good supported Windows USB adapter.
4. Merge/release only after the hardware smoke test passes.
5. GitHub Actions builds `Jarvis-Setup-0.5.0-x64.exe`.
6. Existing installations update through the one-click updater.

## Hardware acceptance tests

- [ ] Windows 10/11 detects the USB adapter as a COM port.
- [ ] Jarvis lists the COM port.
- [ ] Connecting to the selected COM port succeeds.
- [ ] Adapter identity is returned.
- [ ] Automatic protocol selection completes.
- [ ] Supported PID discovery returns a plausible set.
- [ ] RPM reads correctly with engine running.
- [ ] Coolant temperature reads correctly.
- [ ] Vehicle speed reads correctly when safely testable.
- [ ] DTC parser returns normal P/C/B/U codes, not malformed prefixes.
- [ ] VIN returns exactly 17 valid VIN characters when ECU supports Mode 09 PID 02.
- [ ] Disconnect/reconnect does not require restarting Jarvis.
- [ ] Unplugging the adapter is detected without crashing the app.
- [ ] Concurrent voice/UI reads do not interleave serial responses.
- [ ] Blocked write commands cannot be sent through the read-only serial IPC.

## Recommended first hardware target

Use one known-good Windows-compatible adapter as the reference device for commercial testing before claiming broader compatibility. Anonymous ELM327 clones should not define the product's reliability target.
