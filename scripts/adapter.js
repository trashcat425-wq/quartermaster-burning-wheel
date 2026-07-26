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

/**
 * Remove Quartermaster-only transient state without relying on a Foundry utility
 * whose name differs between core versions.
 */
function removeTemporaryFlag(data) {
  const moduleFlags = data?.flags?.[MODULE_ID];
  if (!moduleFlags || typeof moduleFlags !== "object") return;

  delete moduleFlags.temporary;

  if (Object.keys(moduleFlags).length === 0) delete data.flags[MODULE_ID];
  if (data.flags && Object.keys(data.flags).length === 0) delete data.flags;
}

export function sanitizeForTransfer(itemData) {
  const data = foundry.utils.deepClone(itemData);
  delete data._id;
  delete data.folder;
  delete data.sort;

  // Burning Wheel armor should arrive unequipped after transfer.
  if (data.system && Object.prototype.hasOwnProperty.call(data.system, "equipped")) {
    data.system.equipped = false;
  }

  removeTemporaryFlag(data);
  return data;
}

export function vaultActorType() {
  const actorTypes = game.documentTypes?.Actor ?? [];
  return actorTypes.includes("npc") ? "npc" : (actorTypes[0] ?? "character");
}
