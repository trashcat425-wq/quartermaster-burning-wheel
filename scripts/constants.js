export const MODULE_ID = "quartermaster-burning-wheel";
export const MODULE_TITLE = "Quartermaster: Burning Wheel";
export const SOCKET_NAME = `module.${MODULE_ID}`;

export const SETTINGS = Object.freeze({
  VAULT_ID: "vaultActorId",
  BUTTON_LABEL: "buttonLabel",
  ALLOW_SPELLS: "allowSpells",
  CURRENCIES: "currencies",
  MAX_LOG: "maxTransactionLog"
});

export const FLAGS = Object.freeze({
  VAULT: "isVault",
  CURRENCY_BALANCES: "currencyBalances",
  LEGACY_TREASURY: "legacyTreasury",
  LEDGER_VERSION: "ledgerVersion",
  RESOURCES: "resources",
  TRANSACTIONS: "transactions",
  QUANTITY: "quantity",
  ITEM_CATEGORY: "inventoryCategory",
  DATA_VERSION: "dataVersion"
});

export const LEDGER_VERSION = 3;
export const DEFAULT_DENOMINATION_IMAGE = "icons/commodities/currency/coin-embossed-crown-gold.webp";

export const PHYSICAL_ITEM_TYPES = Object.freeze([
  "possession",
  "property",
  "melee weapon",
  "ranged weapon",
  "armor"
]);

/**
 * A Currency is a complete Ledger column. Each denomination is one row and
 * has a stable ID plus a positive integer value measured in the base unit.
 */
export const DEFAULT_CURRENCIES = Object.freeze([
  {
    id: "coin-currency",
    name: "Coin",
    denominations: [
      {
        id: "coin",
        name: "Coin",
        abbreviation: "cn",
        value: 1,
        img: DEFAULT_DENOMINATION_IMAGE
      }
    ]
  }
]);
