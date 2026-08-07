# Quartermaster: Burning Wheel

A Burning Wheel-compatible shared party inventory module for Foundry VTT 14, adapted from Quartermaster by Paul Miscavage.

## Shared inventory

- Dark Quartermaster interface opened from the Foundry Items sidebar.
- Search, sorting, and filtered views for Weapons, Armor, Gear, Possessions, Property, and optional Spells.
- Drag-and-drop or dialog-based deposits.
- Button or drag-and-drop withdrawals to controlled characters.
- Editable Item images using Foundry's file browser.
- Supported physical Burning Wheel Items: possessions, property, melee weapons, ranged weapons, and armor.
- Optional spell storage.

Burning Wheel `possession` Items can be classified by Quartermaster as either **Gear** or **Possessions** for display purposes. This does not alter their Burning Wheel Item type.

## Locked Ledger model

- A **Currency** is one complete Ledger column.
- A **denomination** is one row inside that Currency.
- Currency and denomination IDs are stable and do not change when names, abbreviations, values, or icons are edited.
- Every denomination has a positive integer conversion value.
- Exactly one base denomination in each Currency has a value of `1`.
- **Convert** is user-directed and exchanges a selected amount between two denominations.
- **Normalize** restructures the entire Currency balance into the most efficient denomination combination while preserving total base value.
- Every balance-changing action creates a transaction.
- Deleting a Currency or denomination with a nonzero balance requires an additional explicit confirmation.
- The header pencil performs quick Currency renaming.
- The bottom **Edit** button opens the complete Currency and denomination editor.
- Denomination icons can be uploaded or selected through Foundry's file browser.

Example conversion values:

- Gold Crown: `240`
- Silver Penny: `12`
- Copper Bit: `1`

One Gold Crown therefore converts exactly into twenty Silver Pennies or 240 Copper Bits.

## Transaction history

The module records Item deposits, withdrawals, deletions and image changes, plus currency balance edits, conversions, normalization, structural edits, and confirmed balance deletion.

## Burning Wheel wealth separation

The Quartermaster Ledger is module-owned. It does not alter Burning Wheel Cash, Funds, Resources exponent, or Resources tax.

## Updating from 0.2.0

The first GM to load the world updates Ledger data to schema version 3 and supplies a default icon for denominations that do not already have one. Existing IDs, balances, Items, resources, and transaction history are preserved.

Back up the world before updating.

## Macro API

```js
game.modules.get("quartermaster-burning-wheel").api.open();
```

## License and attribution

This adaptation retains the original Quartermaster copyright and MIT license notice.
