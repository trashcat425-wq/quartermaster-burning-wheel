# Quartermaster: Burning Wheel

A Burning Wheel-compatible shared party inventory module for Foundry VTT 14, adapted from Quartermaster by Paul Miscavage.

## Features

- Hidden shared-vault Actor.
- Party inventory window in the Items sidebar.
- Drag-and-drop deposits and withdrawals.
- Supported physical Burning Wheel Items: possessions, property, melee weapons, ranged weapons, and armor.
- Optional spell storage.
- Currency columns containing editable denomination rows.
- Per-Currency denomination conversion values and exact conversion tools.
- Shared resource counters.
- Transaction history.

## Ledger model

A **Currency** is one Ledger column. Each Currency contains one or more denominations. Every denomination has:

- A stable internal ID.
- An editable name.
- An optional abbreviation.
- A positive whole-number conversion value.
- Its own shared balance.

The smallest denomination must have a conversion value of `1`. Other values are measured relative to it. For example:

- Gold Crown: `240`
- Silver Penny: `12`
- Copper Bit: `1`

This allows exact conversions such as one Gold Crown into twenty Silver Pennies.

Conversions only occur inside the same Currency column. The module does not exchange one Currency column into another.

## Migration from 0.1.x

The first GM to load a world after updating automatically migrates the old flat ledger:

- Each old non-Treasury entry becomes a Currency column with one denomination.
- Existing balances remain attached to their original internal IDs.
- The old Treasury entry is removed from the visible Ledger.
- Any Treasury balance is preserved in the vault's hidden `legacyTreasury` flag.

Back up the world before updating.

## Burning Wheel wealth separation

The Quartermaster ledger is module-owned. It does not alter Burning Wheel Cash, Funds, Resources exponent, or Resources tax.

## Macro API

```js
game.modules.get("quartermaster-burning-wheel").api.open();
```

## License and attribution

This adaptation retains the original Quartermaster copyright and MIT license notice.
