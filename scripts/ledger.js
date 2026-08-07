import {
  DEFAULT_CURRENCIES,
  DEFAULT_DENOMINATION_IMAGE,
  FLAGS,
  LEDGER_VERSION,
  MODULE_ID,
  SETTINGS
} from "./constants.js";
import { getVault } from "./vault.js";

function clone(value) {
  return foundry.utils.deepClone(value);
}

function cleanId(value, fallback = foundry.utils.randomID()) {
  const cleaned = String(value || fallback).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return cleaned || String(fallback).toLowerCase();
}

function cleanDenomination(denomination, usedIds) {
  let id = cleanId(denomination?.id);
  while (usedIds.has(id)) id = cleanId(foundry.utils.randomID());
  usedIds.add(id);

  const numericValue = Number(denomination?.value);
  return {
    id,
    name: String(denomination?.name || "Denomination").trim() || "Denomination",
    abbreviation: String(denomination?.abbreviation || "").trim(),
    value: Number.isInteger(numericValue) && numericValue > 0 ? numericValue : 1,
    img: String(denomination?.img || DEFAULT_DENOMINATION_IMAGE)
  };
}

/**
 * Convert both the grouped schema and the pre-0.2 flat schema into Currency
 * columns. Currency and denomination IDs are retained whenever they are valid.
 * Legacy Treasury is intentionally omitted from the visible Ledger.
 */
export function normalizeCurrencyDefinitions(definitions) {
  const raw = Array.isArray(definitions) ? clone(definitions) : [];
  const isLegacy = raw.some(currency => !Array.isArray(currency?.denominations));
  const usedCurrencyIds = new Set();
  const usedDenominationIds = new Set();
  const normalized = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;

    if (isLegacy) {
      if (String(entry.id || "").toLowerCase() === "treasury") continue;
      let currencyId = cleanId(`${entry.id || foundry.utils.randomID()}-currency`);
      while (usedCurrencyIds.has(currencyId)) currencyId = cleanId(foundry.utils.randomID());
      usedCurrencyIds.add(currencyId);

      normalized.push({
        id: currencyId,
        name: String(entry.name || "Currency").trim() || "Currency",
        denominations: [cleanDenomination({
          id: entry.id,
          name: entry.name,
          abbreviation: entry.abbreviation,
          value: 1,
          img: entry.img
        }, usedDenominationIds)]
      });
      continue;
    }

    let currencyId = cleanId(entry.id);
    while (usedCurrencyIds.has(currencyId)) currencyId = cleanId(foundry.utils.randomID());
    usedCurrencyIds.add(currencyId);

    const denominations = (Array.isArray(entry.denominations) ? entry.denominations : [])
      .map(denomination => cleanDenomination(denomination, usedDenominationIds));

    if (!denominations.length) {
      denominations.push(cleanDenomination({ name: "Unit", value: 1 }, usedDenominationIds));
    }

    normalized.push({
      id: currencyId,
      name: String(entry.name || "Currency").trim() || "Currency",
      denominations
    });
  }

  return normalized.length ? normalized : clone(DEFAULT_CURRENCIES);
}

export function validateCurrencyDefinitions(definitions) {
  const cleaned = normalizeCurrencyDefinitions(definitions);
  const currencyIds = cleaned.map(currency => currency.id);
  const denominationIds = cleaned.flatMap(currency => currency.denominations.map(denomination => denomination.id));

  if (new Set(currencyIds).size !== currencyIds.length) throw new Error("Every Currency must have a unique internal ID.");
  if (new Set(denominationIds).size !== denominationIds.length) throw new Error("Every denomination must have a unique internal ID.");

  for (const currency of cleaned) {
    if (!currency.name) throw new Error("Every Currency needs a name.");
    if (!currency.denominations.length) throw new Error(`${currency.name} needs at least one denomination.`);

    const baseCount = currency.denominations.filter(denomination => denomination.value === 1).length;
    if (baseCount !== 1) throw new Error(`${currency.name} needs exactly one base denomination with a conversion value of 1.`);

    if (currency.denominations.some(denomination => !denomination.name)) {
      throw new Error(`Every denomination in ${currency.name} needs a name.`);
    }
    if (currency.denominations.some(denomination => !Number.isInteger(denomination.value) || denomination.value < 1)) {
      throw new Error(`All conversion values in ${currency.name} must be positive whole numbers.`);
    }

    const abbreviations = currency.denominations
      .map(denomination => denomination.abbreviation.toLowerCase())
      .filter(Boolean);
    if (new Set(abbreviations).size !== abbreviations.length) {
      throw new Error(`${currency.name} contains duplicate denomination abbreviations.`);
    }
  }

  return cleaned;
}

export function currencyDefinitions() {
  return normalizeCurrencyDefinitions(game.settings.get(MODULE_ID, SETTINGS.CURRENCIES));
}

export function currencyBalances(vault = getVault()) {
  return clone(vault?.getFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES) ?? {});
}

export function resources(vault = getVault()) {
  return clone(vault?.getFlag(MODULE_ID, FLAGS.RESOURCES) ?? []);
}

export function transactions(vault = getVault()) {
  return clone(vault?.getFlag(MODULE_ID, FLAGS.TRANSACTIONS) ?? []);
}

export function denominationById(denominationId, definitions = currencyDefinitions()) {
  for (const currency of definitions) {
    const denomination = currency.denominations.find(candidate => candidate.id === denominationId);
    if (denomination) return { currency, denomination };
  }
  return null;
}

export async function recordTransaction(entry, vault = getVault()) {
  if (!vault) throw new Error("Quartermaster vault is unavailable.");
  const max = Math.max(50, Number(game.settings.get(MODULE_ID, SETTINGS.MAX_LOG)) || 500);
  const log = transactions(vault);
  log.unshift({
    id: foundry.utils.randomID(),
    timestamp: Date.now(),
    userId: game.user.id,
    userName: game.user.name,
    ...entry
  });
  if (log.length > max) log.length = max;
  await vault.setFlag(MODULE_ID, FLAGS.TRANSACTIONS, log);
}

export async function adjustCurrency(denominationId, delta, reason = "", audit = {}) {
  const vault = getVault();
  const match = denominationById(denominationId);
  if (!match) throw new Error("Currency denomination not found.");

  const balances = currencyBalances(vault);
  const before = Number(balances[denominationId] ?? 0);
  const amount = Number(delta);
  if (!Number.isInteger(amount)) throw new Error("Currency adjustments must be whole numbers.");
  const after = before + amount;
  if (after < 0) throw new Error("A denomination balance cannot be negative.");

  balances[denominationId] = after;
  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);
  await recordTransaction({
    type: "currency",
    action: amount >= 0 ? "add" : "subtract",
    name: match.denomination.name,
    currencyName: match.currency.name,
    denominationId,
    amount,
    before,
    after,
    reason,
    ...audit
  }, vault);
  return after;
}

export async function setCurrencyBalance(denominationId, value, reason = "Manual balance edit", audit = {}) {
  const vault = getVault();
  const match = denominationById(denominationId);
  if (!match) throw new Error("Currency denomination not found.");

  const after = Number(value);
  if (!Number.isInteger(after) || after < 0) throw new Error("A denomination balance must be a whole number of zero or greater.");

  const balances = currencyBalances(vault);
  const before = Number(balances[denominationId] ?? 0);
  if (before === after) return after;

  balances[denominationId] = after;
  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);
  await recordTransaction({
    type: "currency",
    action: "set-balance",
    name: match.denomination.name,
    currencyName: match.currency.name,
    denominationId,
    amount: after - before,
    before,
    after,
    reason,
    ...audit
  }, vault);
  return after;
}

export async function convertCurrency({ currencyId, fromDenominationId, toDenominationId, amount, reason = "", audit = {} }) {
  const vault = getVault();
  const definitions = currencyDefinitions();
  const currency = definitions.find(candidate => candidate.id === currencyId);
  if (!currency) throw new Error("Currency not found.");

  const from = currency.denominations.find(candidate => candidate.id === fromDenominationId);
  const to = currency.denominations.find(candidate => candidate.id === toDenominationId);
  if (!from || !to) throw new Error("Both denominations must belong to the selected Currency.");
  if (from.id === to.id) throw new Error("Choose two different denominations.");

  const sourceAmount = Number(amount);
  if (!Number.isInteger(sourceAmount) || sourceAmount <= 0) {
    throw new Error("The amount to convert must be a positive whole number.");
  }

  const targetAmount = (sourceAmount * from.value) / to.value;
  if (!Number.isInteger(targetAmount)) {
    throw new Error(`That conversion is not exact. ${sourceAmount} ${from.name} cannot be converted into a whole number of ${to.name}.`);
  }

  const balances = currencyBalances(vault);
  const fromBefore = Number(balances[from.id] ?? 0);
  const toBefore = Number(balances[to.id] ?? 0);
  if (fromBefore < sourceAmount) throw new Error(`There are only ${fromBefore} ${from.name} available.`);

  balances[from.id] = fromBefore - sourceAmount;
  balances[to.id] = toBefore + targetAmount;
  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);

  await recordTransaction({
    type: "currency-conversion",
    action: "convert",
    name: currency.name,
    currencyId: currency.id,
    fromDenominationId: from.id,
    fromName: from.name,
    amount: sourceAmount,
    fromBefore,
    fromAfter: balances[from.id],
    toDenominationId: to.id,
    toName: to.name,
    result: targetAmount,
    toBefore,
    toAfter: balances[to.id],
    reason,
    ...audit
  }, vault);

  return { fromBalance: balances[from.id], toBalance: balances[to.id], result: targetAmount };
}

/** Convert an entire Currency balance into the most compact denomination mix. */
export async function normalizeCurrency(currencyId, reason = "", audit = {}) {
  const vault = getVault();
  const currency = currencyDefinitions().find(candidate => candidate.id === currencyId);
  if (!currency) throw new Error("Currency not found.");

  const balances = currencyBalances(vault);
  const before = Object.fromEntries(currency.denominations.map(denomination => [denomination.id, Number(balances[denomination.id] ?? 0)]));
  const totalBaseValue = currency.denominations.reduce(
    (total, denomination) => total + (before[denomination.id] * denomination.value),
    0
  );

  let remaining = totalBaseValue;
  const sorted = [...currency.denominations].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const after = {};
  for (const denomination of sorted) {
    const count = Math.floor(remaining / denomination.value);
    after[denomination.id] = count;
    remaining -= count * denomination.value;
  }
  if (remaining !== 0) throw new Error("Normalization failed because the Currency does not have a valid base denomination.");

  for (const denomination of currency.denominations) balances[denomination.id] = after[denomination.id] ?? 0;
  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);

  await recordTransaction({
    type: "currency-normalization",
    action: "normalize",
    name: currency.name,
    currencyId: currency.id,
    totalBaseValue,
    before,
    after,
    reason,
    ...audit
  }, vault);

  return { before, after, totalBaseValue };
}

function structureChanges(beforeDefinitions, afterDefinitions) {
  const oldCurrencies = new Map(beforeDefinitions.map(currency => [currency.id, currency]));
  const newCurrencies = new Map(afterDefinitions.map(currency => [currency.id, currency]));
  const addedCurrencies = afterDefinitions.filter(currency => !oldCurrencies.has(currency.id));
  const removedCurrencies = beforeDefinitions.filter(currency => !newCurrencies.has(currency.id));
  const renamedCurrencies = afterDefinitions.filter(currency => {
    const old = oldCurrencies.get(currency.id);
    return old && old.name !== currency.name;
  }).map(currency => ({ id: currency.id, before: oldCurrencies.get(currency.id).name, after: currency.name }));

  const oldDenominations = new Map(beforeDefinitions.flatMap(currency => currency.denominations.map(denomination => [denomination.id, { currency, denomination }])));
  const newDenominations = new Map(afterDefinitions.flatMap(currency => currency.denominations.map(denomination => [denomination.id, { currency, denomination }])));
  const addedDenominations = [...newDenominations.values()].filter(entry => !oldDenominations.has(entry.denomination.id));
  const removedDenominations = [...oldDenominations.values()].filter(entry => !newDenominations.has(entry.denomination.id));

  return { addedCurrencies, removedCurrencies, renamedCurrencies, addedDenominations, removedDenominations };
}

/**
 * Save Currency definitions while preserving stable IDs. Removed denominations
 * with nonzero balances are rejected unless explicit confirmation is supplied.
 */
export async function saveCurrencies(definitions, {
  balanceUpdates = {},
  allowNonZeroDeletion = false,
  action = "configure",
  reason = "",
  audit = {}
} = {}) {
  const cleaned = validateCurrencyDefinitions(definitions);
  const beforeDefinitions = currencyDefinitions();
  const changes = structureChanges(beforeDefinitions, cleaned);
  const nextDenominationIds = new Set(cleaned.flatMap(currency => currency.denominations.map(denomination => denomination.id)));
  const removedIds = beforeDefinitions
    .flatMap(currency => currency.denominations.map(denomination => denomination.id))
    .filter(id => !nextDenominationIds.has(id));

  const vault = getVault();
  const balances = currencyBalances(vault);
  const removedBalanceValues = Object.fromEntries(removedIds.map(id => [id, Number(balances[id] ?? 0)]));
  const nonZeroRemoved = removedIds.filter(id => removedBalanceValues[id] !== 0);
  if (nonZeroRemoved.length && !allowNonZeroDeletion) {
    throw new Error("One or more removed denominations still have a nonzero balance. Confirm permanent deletion before saving.");
  }

  for (const [denominationId, rawValue] of Object.entries(balanceUpdates || {})) {
    if (!nextDenominationIds.has(denominationId)) continue;
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) throw new Error("All denomination balances must be whole numbers of zero or greater.");
  }

  await game.settings.set(MODULE_ID, SETTINGS.CURRENCIES, cleaned);
  if (!vault) return;

  for (const denominationId of removedIds) delete balances[denominationId];
  for (const denominationId of nextDenominationIds) {
    if (!Object.prototype.hasOwnProperty.call(balances, denominationId)) balances[denominationId] = 0;
  }

  const balanceTransactions = [];
  for (const [denominationId, rawValue] of Object.entries(balanceUpdates || {})) {
    if (!nextDenominationIds.has(denominationId)) continue;
    const after = Number(rawValue);
    const before = Number(balances[denominationId] ?? 0);
    if (after === before) continue;
    balances[denominationId] = after;
    const match = denominationById(denominationId, cleaned);
    balanceTransactions.push({
      type: "currency",
      action: "set-balance",
      name: match?.denomination.name ?? denominationId,
      currencyName: match?.currency.name ?? "Currency",
      denominationId,
      amount: after - before,
      before,
      after,
      reason: reason || "Balance changed in Currency editor",
      ...audit
    });
  }

  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);

  for (const denominationId of nonZeroRemoved) {
    const oldMatch = denominationById(denominationId, beforeDefinitions);
    await recordTransaction({
      type: "currency-deletion",
      action: "discard-balance",
      name: oldMatch?.denomination.name ?? denominationId,
      currencyName: oldMatch?.currency.name ?? "Currency",
      denominationId,
      discardedBalance: removedBalanceValues[denominationId],
      reason,
      ...audit
    }, vault);
  }

  for (const entry of balanceTransactions) await recordTransaction(entry, vault);

  const hasStructureChanges = Object.values(changes).some(value => Array.isArray(value) && value.length);
  if (hasStructureChanges || action !== "configure") {
    await recordTransaction({
      type: "currency-configuration",
      action,
      name: "Currency configuration",
      changes: {
        addedCurrencies: changes.addedCurrencies.map(currency => currency.name),
        removedCurrencies: changes.removedCurrencies.map(currency => currency.name),
        renamedCurrencies: changes.renamedCurrencies,
        addedDenominations: changes.addedDenominations.map(entry => `${entry.currency.name}: ${entry.denomination.name}`),
        removedDenominations: changes.removedDenominations.map(entry => `${entry.currency.name}: ${entry.denomination.name}`)
      },
      reason,
      ...audit
    }, vault);
  }
}

/** Migrate older ledgers and add denomination image fields. */
export async function migrateLedgerData(vault = getVault()) {
  if (!game.user.isGM || !vault) return;

  const rawDefinitions = clone(game.settings.get(MODULE_ID, SETTINGS.CURRENCIES) ?? []);
  const legacyFlat = Array.isArray(rawDefinitions) && rawDefinitions.some(currency => !Array.isArray(currency?.denominations));
  const normalized = normalizeCurrencyDefinitions(rawDefinitions);

  if (JSON.stringify(rawDefinitions) !== JSON.stringify(normalized)) {
    await game.settings.set(MODULE_ID, SETTINGS.CURRENCIES, normalized);
  }

  const balances = currencyBalances(vault);
  if (legacyFlat && Object.prototype.hasOwnProperty.call(balances, "treasury")) {
    await vault.setFlag(MODULE_ID, FLAGS.LEGACY_TREASURY, {
      balance: Number(balances.treasury ?? 0),
      migratedAt: Date.now(),
      note: "Preserved when the redundant Treasury ledger field was removed in version 0.2.0."
    });
    delete balances.treasury;
  }

  for (const currency of normalized) {
    for (const denomination of currency.denominations) {
      if (!Object.prototype.hasOwnProperty.call(balances, denomination.id)) balances[denomination.id] = 0;
    }
  }

  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);
  await vault.setFlag(MODULE_ID, FLAGS.LEDGER_VERSION, LEDGER_VERSION);
  await vault.setFlag(MODULE_ID, FLAGS.DATA_VERSION, game.modules.get(MODULE_ID)?.version ?? "0.0.0");
}

export async function saveResources(nextResources) {
  const vault = getVault();
  await vault.setFlag(MODULE_ID, FLAGS.RESOURCES, nextResources);
}

export async function adjustResource(resourceId, delta, reason = "", audit = {}) {
  const vault = getVault();
  const list = resources(vault);
  const resource = list.find(candidate => candidate.id === resourceId);
  if (!resource) throw new Error("Resource not found.");
  const before = Number(resource.value ?? 0);
  const amount = Number(delta);
  if (!Number.isFinite(amount)) throw new Error("Resource adjustment must be numeric.");
  let after = before + amount;
  if (Number.isFinite(Number(resource.max)) && resource.max !== null && resource.max !== "") after = Math.min(after, Number(resource.max));
  after = Math.max(0, after);
  resource.value = after;
  await saveResources(list);
  await recordTransaction({ type: "resource", action: amount >= 0 ? "add" : "subtract", name: resource.name, amount, before, after, reason, ...audit }, vault);
  return after;
}
