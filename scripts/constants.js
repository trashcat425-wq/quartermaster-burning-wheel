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
  RESOURCES: "resources",
  TRANSACTIONS: "transactions",
  QUANTITY: "quantity",
  DATA_VERSION: "dataVersion"
});

export const PHYSICAL_ITEM_TYPES = Object.freeze([
  "possession",
  "property",
  "melee weapon",
  "ranged weapon",
  "armor"
]);

export const DEFAULT_CURRENCIES = Object.freeze([
  { id: "coin", name: "Coin", abbreviation: "cn" },
  { id: "treasury", name: "Treasury", abbreviation: "tr" }
]);
