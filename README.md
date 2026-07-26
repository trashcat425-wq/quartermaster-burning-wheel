# Quartermaster: Burning Wheel

A Burning Wheel-compatible adaptation of the open-source **Quartermaster** Foundry VTT module by Paul Miscavage.

## Compatibility target

- Foundry Virtual Tabletop 14
- `burningwheel` system 1.7.1

## Included in this beta

- Hidden shared-vault Actor
- Shared physical inventory
- Drag Items from controlled Actors, world Items, or compendiums into the vault
- Send vault Items to a selected controlled Actor
- Drag vault Items onto Burning Wheel Actor sheets
- Burning Wheel Item whitelist: possession, property, melee weapon, ranged weapon, armor
- Optional spell storage
- Module-owned shared currency ledger
- Shared resource counters
- Transaction log
- Player requests routed through a connected GM
- Macro API: `game.modules.get("quartermaster-burning-wheel").api.open()`

## Deliberate Burning Wheel behavior

The module does **not** synchronize its shared ledger with Actor `system.cash`, `system.funds`, `system.resources`, or `system.resourcesTax`. Those are Burning Wheel character mechanics rather than ordinary coin denominations.

Beliefs, instincts, traits, skills, relationships, reputations, affiliations, and lifepaths are rejected from the vault.

## Installation

1. Unzip the package into Foundry's `Data/modules` directory.
2. The final directory must be `Data/modules/quartermaster-burning-wheel/` with `module.json` directly inside it.
3. Start a Burning Wheel world and enable **Quartermaster: Burning Wheel** under Manage Modules.
4. Connect once as a GM. The hidden vault Actor is created automatically.
5. Open the Items sidebar and click **Party Inventory**.

## Testing status

This package has been statically validated for JSON and JavaScript syntax. It has not been executed inside a live Foundry 14 Burning Wheel world, so treat version `0.1.0-bw.1` as a development beta and back up the world before testing.

## Attribution

Quartermaster is Copyright (c) 2026 Paul Miscavage and distributed under the MIT License. This adaptation preserves the original copyright and license notice.
