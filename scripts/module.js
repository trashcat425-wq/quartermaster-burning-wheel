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

Hooks.on("dropActorSheetData", async (actor, _sheet, data) => {
  if (!data?.quartermasterBW || !data.itemId) return;
  try {
    await requestOperation("withdraw", { itemId: data.itemId, targetActorId: actor.id });
    ui.notifications.info(`${MODULE_TITLE}: item transferred to ${actor.name}.`);
    return false;
  } catch (error) {
    ui.notifications.error(error.message);
    return false;
  }
});
