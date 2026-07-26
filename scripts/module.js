import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import { registerSettings } from "./settings.js";
import { ensureVault, hideVaultFromDirectory, hideVaultFromUserConfig, preventVaultCharacterAssignment, preventVaultDeletion } from "./vault.js";
import { injectSidebarButton, openQuartermaster } from "./app.js";
import { registerSocket, requestOperation } from "./operations.js";

Hooks.once("init", () => {
  registerSettings();
  game.modules.get(MODULE_ID).api = {
    open: openQuartermaster,
    requestOperation
  };
  console.log(`${MODULE_TITLE} | Initialized`);
});

Hooks.once("ready", async () => {
  registerSocket();
  await ensureVault();
});

Hooks.on("renderItemDirectory", injectSidebarButton);
Hooks.on("renderActorDirectory", hideVaultFromDirectory);
Hooks.on("renderUserConfig", hideVaultFromUserConfig);
Hooks.on("preUpdateUser", preventVaultCharacterAssignment);
Hooks.on("preDeleteActor", preventVaultDeletion);

const pendingSheetDrops = new Set();

Hooks.on("dropActorSheetData", (actor, _sheet, data) => {
  if (!data?.quartermasterBW || !data.itemId) return;

  // This hook must return false synchronously. An async hook returns a Promise,
  // which allows the Actor sheet's normal Item-drop handler to run as well and
  // create a duplicate before Quartermaster completes its own withdrawal.
  const transferKey = `${data.itemId}:${actor.id}`;
  if (!pendingSheetDrops.has(transferKey)) {
    pendingSheetDrops.add(transferKey);
    requestOperation("withdraw", { itemId: data.itemId, targetActorId: actor.id })
      .then(() => ui.notifications.info(`${MODULE_TITLE}: item transferred to ${actor.name}.`))
      .catch(error => ui.notifications.error(error.message))
      .finally(() => pendingSheetDrops.delete(transferKey));
  }

  return false;
});
