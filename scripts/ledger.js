import { FLAGS, MODULE_ID, SETTINGS } from "./constants.js";
import { getVault } from "./vault.js";

export function currencyDefinitions() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.CURRENCIES) ?? []);
}

export function currencyBalances(vault = getVault()) {
  return foundry.utils.deepClone(vault?.getFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES) ?? {});
}

export function resources(vault = getVault()) {
  return foundry.utils.deepClone(vault?.getFlag(MODULE_ID, FLAGS.RESOURCES) ?? []);
}

export function transactions(vault = getVault()) {
  return foundry.utils.deepClone(vault?.getFlag(MODULE_ID, FLAGS.TRANSACTIONS) ?? []);
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

export async function adjustCurrency(currencyId, delta, reason = "") {
  const vault = getVault();
  const balances = currencyBalances(vault);
  const oldValue = Number(balances[currencyId] ?? 0);
  const amount = Number(delta);
  if (!Number.isFinite(amount)) throw new Error("Currency adjustment must be numeric.");
  const next = oldValue + amount;
  balances[currencyId] = next;
  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);
  const def = currencyDefinitions().find(c => c.id === currencyId);
  await recordTransaction({ type: "currency", action: amount >= 0 ? "add" : "subtract", name: def?.name ?? currencyId, amount, before: oldValue, after: next, reason }, vault);
  return next;
}

export async function saveCurrencies(definitions) {
  const cleaned = definitions.map(c => ({
    id: String(c.id || foundry.utils.randomID()).replace(/[^a-z0-9_-]/gi, "-").toLowerCase(),
    name: String(c.name || "Currency").trim(),
    abbreviation: String(c.abbreviation || "").trim()
  }));
  await game.settings.set(MODULE_ID, SETTINGS.CURRENCIES, cleaned);
  const vault = getVault();
  const balances = currencyBalances(vault);
  for (const c of cleaned) if (!Object.hasOwn(balances, c.id)) balances[c.id] = 0;
  await vault.setFlag(MODULE_ID, FLAGS.CURRENCY_BALANCES, balances);
}

export async function saveResources(nextResources) {
  const vault = getVault();
  await vault.setFlag(MODULE_ID, FLAGS.RESOURCES, nextResources);
}

export async function adjustResource(resourceId, delta, reason = "") {
  const vault = getVault();
  const list = resources(vault);
  const resource = list.find(r => r.id === resourceId);
  if (!resource) throw new Error("Resource not found.");
  const before = Number(resource.value ?? 0);
  const amount = Number(delta);
  if (!Number.isFinite(amount)) throw new Error("Resource adjustment must be numeric.");
  let after = before + amount;
  if (Number.isFinite(Number(resource.max)) && resource.max !== null && resource.max !== "") after = Math.min(after, Number(resource.max));
  after = Math.max(0, after);
  resource.value = after;
  await saveResources(list);
  await recordTransaction({ type: "resource", action: amount >= 0 ? "add" : "subtract", name: resource.name, amount, before, after, reason }, vault);
  return after;
}
