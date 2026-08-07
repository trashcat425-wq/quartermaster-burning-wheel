# Changelog

## 0.3.0-bw.1

- Rebuilt the shared inventory and Ledger in the approved dark Quartermaster interface.
- Added inventory search, sorting, and section filters for Weapons, Armor, Gear, Possessions, Property, and optional Spells.
- Added a Deposit Items dialog while retaining drag-and-drop deposits.
- Added editable shared-Item images through Foundry's file browser.
- Added a Gear/Possession classification flag for Burning Wheel possession Items.
- Defined a Currency as one complete Ledger column and a denomination as one row within it.
- Added editable denomination icons through Foundry's file browser.
- Added quick Currency renaming from the header pencil.
- Kept the full Currency editor on the bottom Edit button.
- Removed the duplicate header delete control.
- Added inline denomination balance editing, with every change recorded as a transaction.
- Added manual Convert and whole-Currency Normalize actions.
- Added a Recent Transactions panel to the Ledger and a complete Transactions tab.
- Added Currency reordering.
- Added enforced confirmation before deleting any Currency or denomination with a nonzero balance.
- Preserved stable Currency and denomination IDs through renames, icon changes, and full edits.
- Moved the existing shared-resource interface into the Settings tab.

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
