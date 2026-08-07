import { DEFAULT_CURRENCIES, FLAGS, LEDGER_VERSION, MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.js";
import { vaultActorType } from "./adapter.js";

export function getVault() {
  const id = game.settings.get(MODULE_ID, SETTINGS.VAULT_ID);
  const byId = id ? game.actors.get(id) : null;
  if (byId?.getFlag(MODULE_ID, FLAGS.VAULT)) return byId;
  return game.actors.find(a => a.getFlag(MODULE_ID, FLAGS.VAULT)) ?? null;
}

export async function ensureVault() {
  let vault = getVault();
  if (vault) {
    if (game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) !== vault.id) {
      await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, vault.id);
    }
    return vault;
  }
  if (!game.user.isGM) return null;

  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
  for (const user of game.users) if (user.isGM) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  const balances = {};
  for (const currency of DEFAULT_CURRENCIES) {
    for (const denomination of currency.denominations) balances[denomination.id] = 0;
  }

  const cls = getDocumentClass("Actor");
  vault = await cls.create({
    name: "Quartermaster Vault (Burning Wheel)",
    type: vaultActorType(),
    img: "icons/containers/bags/pack-leather-brown.webp",
    ownership,
    flags: {
      [MODULE_ID]: {
        [FLAGS.VAULT]: true,
        [FLAGS.CURRENCY_BALANCES]: balances,
        [FLAGS.LEDGER_VERSION]: LEDGER_VERSION,
        [FLAGS.RESOURCES]: [],
        [FLAGS.TRANSACTIONS]: [],
        [FLAGS.DATA_VERSION]: game.modules.get(MODULE_ID)?.version ?? "0.0.0"
      }
    }
  });
  await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, vault.id);
  ui.notifications.info(`${MODULE_TITLE}: shared vault created.`);
  return vault;
}

function renderedRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
}

export function hideVaultFromDirectory(_app, html) {
  const vault = getVault();
  const root = renderedRoot(html);
  if (!vault || !root) return;
  for (const selector of [`[data-entry-id="${vault.id}"]`, `[data-document-id="${vault.id}"]`]) {
    root.querySelectorAll(selector).forEach(el => el.remove());
  }
}

export function hideVaultFromUserConfig(_app, html) {
  const vault = getVault();
  const root = renderedRoot(html);
  if (!vault || !root) return;
  root.querySelectorAll(`select[name="character"] option[value="${vault.id}"], select[name="character"] option[value="${vault.uuid}"]`).forEach(el => el.remove());
}

export function preventVaultCharacterAssignment(_user, changes) {
  const vault = getVault();
  const selected = typeof changes.character === "string" ? changes.character : changes.character?.id;
  if (vault && (selected === vault.id || selected === vault.uuid)) changes.character = null;
}

export function preventVaultDeletion(actor) {
  if (!actor.getFlag(MODULE_ID, FLAGS.VAULT)) return;
  ui.notifications.warn(`${MODULE_TITLE}: disable the module before deleting its vault.`);
  return false;
}
