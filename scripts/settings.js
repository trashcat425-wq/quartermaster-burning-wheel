import { DEFAULT_CURRENCIES, MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.js";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.VAULT_ID, {
    name: "Vault Actor ID",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.BUTTON_LABEL, {
    name: `${MODULE_TITLE}: Button label`,
    hint: "Label shown in the Items sidebar.",
    scope: "world",
    config: true,
    type: String,
    default: "Party Inventory"
  });

  game.settings.register(MODULE_ID, SETTINGS.ALLOW_SPELLS, {
    name: `${MODULE_TITLE}: Allow spell Items`,
    hint: "Allows Burning Wheel spell Items in the shared vault. Beliefs, instincts, traits, skills, relationships, reputations, affiliations, and lifepaths are always rejected.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.CURRENCIES, {
    name: "Currency definitions",
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_CURRENCIES)
  });

  game.settings.register(MODULE_ID, SETTINGS.MAX_LOG, {
    name: `${MODULE_TITLE}: Maximum transaction entries`,
    hint: "Older entries are discarded after this limit is reached.",
    scope: "world",
    config: true,
    type: Number,
    default: 500,
    range: { min: 50, max: 2000, step: 50 }
  });
}
