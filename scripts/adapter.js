import { FLAGS, MODULE_ID, PHYSICAL_ITEM_TYPES, SETTINGS } from "./constants.js";

export function allowedItemTypes() {
  const types = [...PHYSICAL_ITEM_TYPES];
  if (game.settings.get(MODULE_ID, SETTINGS.ALLOW_SPELLS)) types.push("spell");
  return types;
}

export function isAllowedItem(itemOrData) {
  return Boolean(itemOrData && allowedItemTypes().includes(itemOrData.type));
}

export function itemQuantity(item) {
  const value = Number(item.getFlag?.(MODULE_ID, FLAGS.QUANTITY) ?? item.flags?.[MODULE_ID]?.[FLAGS.QUANTITY] ?? 1);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function displayDescription(item) {
  const raw = item.system?.description ?? "";
  if (typeof raw === "string") return raw;
  return raw?.value ?? "";
}

export function sanitizeForTransfer(itemData) {
  const data = foundry.utils.deepClone(itemData);
  delete data._id;
  delete data.folder;
  delete data.sort;
  if (data.system && Object.hasOwn(data.system, "equipped")) data.system.equipped = false;
  foundry.utils.unsetProperty(data, `flags.${MODULE_ID}.temporary`);
  return data;
}

export function vaultActorType() {
  const actorTypes = game.documentTypes?.Actor ?? [];
  return actorTypes.includes("npc") ? "npc" : (actorTypes[0] ?? "character");
}
