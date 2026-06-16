# Changelog

## Unreleased

- Preserved trailing spaces in `sub2apiUsage.statusLabel` when rendering status bar usage text.
- Added `sub2apiUsage.statusLabel` for customizing the status bar usage prefix.
- Added explicit Settings UI ordering so Warn threshold options appear before Danger options.
- Renamed threshold settings to grouped `sub2apiUsage.threshold.*` keys so related options stay adjacent in VS Code Settings.
- Added optional status bar threshold background colors for 7d Warn and Danger usage levels.
- Threshold icon escalation now uses the 7d usage percentage only.

## 0.1.0

- Initial Sub2api Usage Monitor implementation.
- Added status bar usage display with percentage, quota, remaining, and compact modes.
- Added SecretStorage token commands.
- Added manual refresh, details Quick Pick, settings command, polling, and configuration handling.
- Added formatter unit tests for rate limit parsing and display fallbacks.
- Added configurable placeholder text when both quota windows are hidden.
