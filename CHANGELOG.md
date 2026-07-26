# Changelog

## 0.2.0-bw.1

- Rebuilt the Ledger around Currency columns and denomination rows.
- Added editing for existing Currency names.
- Added denomination editing, including names, abbreviations, and integer conversion values.
- Added exact denomination conversions within each Currency column.
- Added balance checks and negative-balance protection.
- Removed the redundant Treasury field from the visible Ledger.
- Added automatic migration from the pre-0.2 flat currency list.
- Preserved any old Treasury balance in the hidden `legacyTreasury` vault flag.
- Added clearer currency and conversion transaction-log details.
- Expanded the Ledger window and added responsive column styling.

## 0.1.2-bw.1

- Prevented duplicate Items when dragging from Quartermaster to a Burning Wheel Actor sheet.
- Added a custom Quartermaster drag data type.
- Made the Actor-sheet drop hook cancel synchronously.

## 0.1.1-bw.1

- Fixed Foundry 14 Item transfer sanitization.

## 0.1.0-bw.1

- Initial Burning Wheel-compatible development release.
