import { FLAGS, MODULE_ID, MODULE_TITLE, SOCKET_NAME } from "./constants.js";
import { isAllowedItem, sanitizeForTransfer } from "./adapter.js";
import { adjustCurrency, adjustResource, recordTransaction, saveCurrencies, saveResources } from "./ledger.js";
import { getVault } from "./vault.js";

const pending = new Map();

function activeGM() {
  return game.users.find(u => u.active && u.isGM) ?? null;
}

function validateActorControl(actor, user) {
  return user?.isGM || actor?.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

async function perform(op, payload, requestingUser = game.user) {
  const vault = getVault();
  if (!vault) throw new Error("Quartermaster vault is unavailable.");

  if (op === "deposit") {
    const sourceActor = game.actors.get(payload.sourceActorId);
    const item = sourceActor?.items.get(payload.itemId);
    if (!sourceActor || !item) throw new Error("Source item no longer exists.");
    if (!validateActorControl(sourceActor, requestingUser)) throw new Error("You do not control the source Actor.");
    if (!isAllowedItem(item)) throw new Error(`Burning Wheel ${item.type} Items cannot be stored in the party vault.`);
    const created = await vault.createEmbeddedDocuments("Item", [sanitizeForTransfer(item.toObject())]);
    try {
      await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
    } catch (error) {
      if (created[0]?.id) await vault.deleteEmbeddedDocuments("Item", [created[0].id]);
      throw error;
    }
    await recordTransaction({ type: "item", action: "deposit", name: item.name, itemType: item.type, source: sourceActor.name, destination: vault.name, createdItemId: created[0]?.id, userId: requestingUser.id, userName: requestingUser.name });
    return { itemId: created[0]?.id };
  }

  if (op === "import") {
    const item = await fromUuid(payload.uuid);
    if (!item) throw new Error("Dropped Item could not be resolved.");
    if (!isAllowedItem(item)) throw new Error(`Burning Wheel ${item.type} Items cannot be stored in the party vault.`);
    const created = await vault.createEmbeddedDocuments("Item", [sanitizeForTransfer(item.toObject())]);
    await recordTransaction({ type: "item", action: "import", name: item.name, itemType: item.type, source: item.pack ? "Compendium" : "World Item", destination: vault.name, createdItemId: created[0]?.id, userId: requestingUser.id, userName: requestingUser.name });
    return { itemId: created[0]?.id };
  }

  if (op === "withdraw") {
    const item = vault.items.get(payload.itemId);
    const targetActor = game.actors.get(payload.targetActorId);
    if (!item || !targetActor) throw new Error("Vault item or destination Actor no longer exists.");
    if (!validateActorControl(targetActor, requestingUser)) throw new Error("You do not control the destination Actor.");
    if (!isAllowedItem(item)) throw new Error(`Burning Wheel ${item.type} Items cannot be transferred by this module.`);
    const created = await targetActor.createEmbeddedDocuments("Item", [sanitizeForTransfer(item.toObject())]);
    try {
      await vault.deleteEmbeddedDocuments("Item", [item.id]);
    } catch (error) {
      if (created[0]?.id) await targetActor.deleteEmbeddedDocuments("Item", [created[0].id]);
      throw error;
    }
    await recordTransaction({ type: "item", action: "withdraw", name: item.name, itemType: item.type, source: vault.name, destination: targetActor.name, createdItemId: created[0]?.id, userId: requestingUser.id, userName: requestingUser.name });
    return { itemId: created[0]?.id };
  }

  if (op === "deleteItem") {
    if (!requestingUser.isGM) throw new Error("Only a GM can delete vault Items.");
    const item = vault.items.get(payload.itemId);
    if (!item) return {};
    await vault.deleteEmbeddedDocuments("Item", [item.id]);
    await recordTransaction({ type: "item", action: "delete", name: item.name, itemType: item.type, source: vault.name });
    return {};
  }

  if (op === "currency") {
    if (!requestingUser.isGM) throw new Error("Only a GM can change shared currency.");
    return { value: await adjustCurrency(payload.currencyId, payload.delta, payload.reason) };
  }

  if (op === "resource") {
    if (!requestingUser.isGM) throw new Error("Only a GM can change shared resources.");
    return { value: await adjustResource(payload.resourceId, payload.delta, payload.reason) };
  }

  if (op === "saveCurrencies") {
    if (!requestingUser.isGM) throw new Error("Only a GM can configure currencies.");
    await saveCurrencies(payload.definitions);
    return {};
  }

  if (op === "saveResources") {
    if (!requestingUser.isGM) throw new Error("Only a GM can configure resources.");
    await saveResources(payload.resources);
    return {};
  }

  throw new Error(`Unknown Quartermaster operation: ${op}`);
}

export async function requestOperation(op, payload = {}) {
  if (game.user.isGM) {
    const result = await perform(op, payload, game.user);
    game.socket.emit(SOCKET_NAME, { type: "refresh" });
    Hooks.callAll(`${MODULE_ID}.refresh`);
    return result;
  }
  const gm = activeGM();
  if (!gm) throw new Error("A GM must be connected to change the shared inventory.");
  const requestId = foundry.utils.randomID();
  return await new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    game.socket.emit(SOCKET_NAME, { type: "request", requestId, op, payload, userId: game.user.id, gmId: gm.id });
    setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      reject(new Error("Quartermaster request timed out."));
    }, 15000);
  });
}

export function registerSocket() {
  game.socket.on(SOCKET_NAME, async message => {
    if (message.type === "response" && message.userId === game.user.id) {
      const p = pending.get(message.requestId);
      if (!p) return;
      pending.delete(message.requestId);
      message.ok ? p.resolve(message.result) : p.reject(new Error(message.error));
      return;
    }

    if (message.type === "refresh") {
      Hooks.callAll(`${MODULE_ID}.refresh`);
      return;
    }

    if (message.type !== "request" || !game.user.isGM || message.gmId !== game.user.id) return;
    const requestingUser = game.users.get(message.userId);
    try {
      const result = await perform(message.op, message.payload, requestingUser);
      game.socket.emit(SOCKET_NAME, { type: "response", requestId: message.requestId, userId: message.userId, ok: true, result });
      game.socket.emit(SOCKET_NAME, { type: "refresh" });
      Hooks.callAll(`${MODULE_ID}.refresh`);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Operation failed`, error);
      game.socket.emit(SOCKET_NAME, { type: "response", requestId: message.requestId, userId: message.userId, ok: false, error: error.message });
    }
  });
}
