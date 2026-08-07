import {
  DEFAULT_DENOMINATION_IMAGE,
  FLAGS,
  MODULE_ID,
  MODULE_TITLE,
  SETTINGS
} from "./constants.js";
import { allowedItemTypes, displayDescription, itemQuantity } from "./adapter.js";
import { currencyBalances, currencyDefinitions, resources, transactions } from "./ledger.js";
import { requestOperation } from "./operations.js";
import { getVault } from "./vault.js";

function controlledCharacters() {
  return game.actors.filter(actor => {
    if (!["character", "npc"].includes(actor.type)) return false;
    if (actor.getFlag(MODULE_ID, FLAGS.VAULT)) return false;
    return game.user.isGM || actor.isOwner;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function rootOf(html) {
  return html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
}

function labelItemType(type) {
  const labels = {
    "melee weapon": "Melee Weapon",
    "ranged weapon": "Ranged Weapon",
    armor: "Armor",
    possession: "Possession",
    property: "Property",
    spell: "Spell"
  };
  return labels[type] ?? type;
}

function itemCategory(item) {
  if (["melee weapon", "ranged weapon"].includes(item.type)) return "weapons";
  if (item.type === "armor") return "armor";
  if (item.type === "property") return "property";
  if (item.type === "spell") return "spells";
  if (item.type === "possession") return item.getFlag(MODULE_ID, FLAGS.ITEM_CATEGORY) === "gear" ? "gear" : "possessions";
  return "other";
}

function stripHtml(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value || "");
  return (div.textContent || div.innerText || "").trim();
}

async function chooseImage(current = "") {
  return await new Promise(resolve => {
    const Picker = globalThis.FilePicker?.implementation ?? globalThis.FilePicker;
    if (!Picker) {
      ui.notifications.error("Foundry's file browser is unavailable.");
      resolve(null);
      return;
    }
    const picker = new Picker({
      type: "image",
      current,
      callback: path => resolve(path)
    });
    const result = picker.browse?.(current);
    if (result?.catch) result.catch(error => {
      console.error(`${MODULE_TITLE} | File picker failed`, error);
      resolve(null);
    });
  });
}

async function promptText({ title, label, value = "", confirmLabel = "Save" }) {
  return await new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${escape(label)}</label><input type="text" name="value" value="${escape(value)}" required autofocus></div></form>`,
      buttons: {
        save: {
          label: confirmLabel,
          callback: html => {
            const root = rootOf(html);
            const next = String(root?.querySelector('[name="value"]')?.value || "").trim();
            if (!next) {
              ui.notifications.warn(`${label} cannot be blank.`);
              return false;
            }
            finish(next);
          }
        },
        cancel: { label: "Cancel", callback: () => finish(null) }
      },
      default: "save",
      close: () => finish(null)
    }).render(true);
  });
}

function denominationEditorRow(denomination = {}, balance = 0) {
  const id = denomination.id || foundry.utils.randomID();
  const value = Number.isInteger(Number(denomination.value)) && Number(denomination.value) > 0 ? Number(denomination.value) : 1;
  const img = denomination.img || DEFAULT_DENOMINATION_IMAGE;
  const safeBalance = Number.isInteger(Number(balance)) && Number(balance) >= 0 ? Number(balance) : 0;
  return `
    <div class="qm-denomination-editor-row" data-denomination-id="${escape(id)}">
      <input type="hidden" name="denominationId" value="${escape(id)}">
      <input type="hidden" name="denominationImage" value="${escape(img)}">
      <button type="button" class="qm-editor-image" data-action="choose-denomination-image" title="Choose denomination icon">
        <img src="${escape(img)}" alt="">
      </button>
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="denominationName" value="${escape(denomination.name || "Unit")}" required>
      </div>
      <div class="form-group">
        <label>Abbreviation</label>
        <input type="text" name="denominationAbbreviation" value="${escape(denomination.abbreviation || "")}" maxlength="12">
      </div>
      <div class="form-group qm-conversion-value-field">
        <label>Value</label>
        <input type="number" name="denominationValue" value="${value}" min="1" step="1" required>
      </div>
      <div class="form-group">
        <label>Balance</label>
        <input type="number" name="denominationBalance" value="${safeBalance}" min="0" step="1" required>
      </div>
      <button type="button" class="qm-danger-icon" data-action="remove-denomination" title="Remove denomination"><i class="fas fa-trash"></i></button>
    </div>`;
}

function readCurrencyEditor(root, currencyId) {
  const form = root?.querySelector("form");
  const name = String(form?.querySelector('[name="currencyName"]')?.value || "").trim();
  const denominations = [...(form?.querySelectorAll(".qm-denomination-editor-row") ?? [])].map(row => ({
    id: String(row.querySelector('[name="denominationId"]')?.value || foundry.utils.randomID()),
    name: String(row.querySelector('[name="denominationName"]')?.value || "").trim(),
    abbreviation: String(row.querySelector('[name="denominationAbbreviation"]')?.value || "").trim(),
    value: Number(row.querySelector('[name="denominationValue"]')?.value),
    img: String(row.querySelector('[name="denominationImage"]')?.value || DEFAULT_DENOMINATION_IMAGE),
    balance: Number(row.querySelector('[name="denominationBalance"]')?.value)
  }));

  if (!name) throw new Error("Enter a Currency name.");
  if (!denominations.length) throw new Error("A Currency needs at least one denomination.");
  if (denominations.some(denomination => !denomination.name)) throw new Error("Every denomination needs a name.");
  if (denominations.some(denomination => !Number.isInteger(denomination.value) || denomination.value < 1)) {
    throw new Error("Conversion values must be positive whole numbers.");
  }
  if (denominations.filter(denomination => denomination.value === 1).length !== 1) {
    throw new Error("Set exactly one base denomination's conversion value to 1.");
  }
  if (denominations.some(denomination => !Number.isInteger(denomination.balance) || denomination.balance < 0)) {
    throw new Error("Balances must be whole numbers of zero or greater.");
  }
  const abbreviations = denominations.map(denomination => denomination.abbreviation.toLowerCase()).filter(Boolean);
  if (new Set(abbreviations).size !== abbreviations.length) throw new Error("Denomination abbreviations must be unique within a Currency.");

  return {
    definition: {
      id: currencyId,
      name,
      denominations: denominations.map(({ balance, ...denomination }) => denomination)
    },
    balanceUpdates: Object.fromEntries(denominations.map(denomination => [denomination.id, denomination.balance]))
  };
}

async function promptCurrencyDefinition(currency = null, balances = {}, { appendDenomination = false } = {}) {
  const working = currency ? foundry.utils.deepClone(currency) : {
    id: foundry.utils.randomID(),
    name: "New Currency",
    denominations: [{ id: foundry.utils.randomID(), name: "Unit", abbreviation: "", value: 1, img: DEFAULT_DENOMINATION_IMAGE }]
  };
  if (appendDenomination) {
    working.denominations.push({ id: foundry.utils.randomID(), name: "New Denomination", abbreviation: "", value: 2, img: DEFAULT_DENOMINATION_IMAGE });
  }

  const rows = working.denominations.map(denomination => denominationEditorRow(denomination, balances[denomination.id] ?? 0)).join("");
  const content = `
    <form class="qm-currency-editor">
      <div class="form-group qm-currency-name-field">
        <label>Currency Name</label>
        <input type="text" name="currencyName" value="${escape(working.name)}" required autofocus>
      </div>
      <p class="notes">A Currency is a complete Ledger column. Each denomination is one row. Exactly one base denomination must have a value of 1.</p>
      <div class="qm-editor-headings"><span></span><span>Name</span><span>Abbreviation</span><span>Value</span><span>Balance</span><span></span></div>
      <div class="qm-denomination-editor-list">${rows}</div>
      <button type="button" class="qm-link-button" data-action="add-denomination"><i class="fas fa-plus"></i> Add Denomination</button>
    </form>`;

  return await new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    new Dialog({
      title: currency ? `Edit Currency: ${working.name}` : "Add Currency",
      content,
      buttons: {
        save: {
          label: currency ? "Save Changes" : "Create Currency",
          callback: html => {
            try {
              finish(readCurrencyEditor(rootOf(html), working.id));
            } catch (error) {
              ui.notifications.warn(error.message);
              return false;
            }
          }
        },
        cancel: { label: "Cancel", callback: () => finish(null) }
      },
      default: "save",
      render: html => {
        const root = rootOf(html);
        root?.querySelector('[data-action="add-denomination"]')?.addEventListener("click", () => {
          root.querySelector(".qm-denomination-editor-list")?.insertAdjacentHTML("beforeend", denominationEditorRow());
        });
        root?.addEventListener("click", async event => {
          const remove = event.target.closest('[data-action="remove-denomination"]');
          if (remove) {
            remove.closest(".qm-denomination-editor-row")?.remove();
            return;
          }
          const pickerButton = event.target.closest('[data-action="choose-denomination-image"]');
          if (!pickerButton) return;
          const row = pickerButton.closest(".qm-denomination-editor-row");
          const input = row?.querySelector('[name="denominationImage"]');
          const path = await chooseImage(input?.value || DEFAULT_DENOMINATION_IMAGE);
          if (!path || !input) return;
          input.value = path;
          const img = pickerButton.querySelector("img");
          if (img) img.src = path;
        });
      },
      close: () => finish(null)
    }, { width: 900 }).render(true);
  });
}

async function promptConversion(currency, balances) {
  if (!currency || currency.denominations.length < 2) {
    ui.notifications.warn("Add at least two denominations before converting currency.");
    return null;
  }

  const options = currency.denominations.map(denomination =>
    `<option value="${escape(denomination.id)}">${escape(denomination.name)}${denomination.abbreviation ? ` (${escape(denomination.abbreviation)})` : ""}</option>`
  ).join("");

  const content = `
    <form class="qm-conversion-form">
      <div class="form-group"><label>Currency</label><input type="text" value="${escape(currency.name)}" disabled></div>
      <div class="form-group"><label>From</label><select name="fromDenominationId">${options}</select><span class="qm-available qm-from-available"></span></div>
      <div class="form-group"><label>To</label><select name="toDenominationId">${options}</select><span class="qm-available qm-to-available"></span></div>
      <div class="form-group"><label>Amount to convert</label><input type="number" name="amount" min="1" step="1" value="1" autofocus></div>
      <div class="qm-conversion-preview"></div>
    </form>`;

  return await new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    new Dialog({
      title: "Convert Currency",
      content,
      buttons: {
        convert: {
          label: "Convert",
          callback: html => {
            const root = rootOf(html);
            finish({
              currencyId: currency.id,
              amount: Number(root?.querySelector('[name="amount"]')?.value),
              fromDenominationId: root?.querySelector('[name="fromDenominationId"]')?.value,
              toDenominationId: root?.querySelector('[name="toDenominationId"]')?.value
            });
          }
        },
        cancel: { label: "Cancel", callback: () => finish(null) }
      },
      default: "convert",
      render: html => {
        const root = rootOf(html);
        const updatePreview = () => {
          const amount = Number(root?.querySelector('[name="amount"]')?.value);
          const fromId = root?.querySelector('[name="fromDenominationId"]')?.value;
          const toId = root?.querySelector('[name="toDenominationId"]')?.value;
          const from = currency.denominations.find(denomination => denomination.id === fromId);
          const to = currency.denominations.find(denomination => denomination.id === toId);
          const preview = root?.querySelector(".qm-conversion-preview");
          const fromAvailable = Number(balances[fromId] ?? 0);
          const toAvailable = Number(balances[toId] ?? 0);
          if (root?.querySelector(".qm-from-available")) root.querySelector(".qm-from-available").textContent = `Balance: ${fromAvailable}`;
          if (root?.querySelector(".qm-to-available")) root.querySelector(".qm-to-available").textContent = `Balance: ${toAvailable}`;
          if (!preview || !from || !to || !Number.isInteger(amount) || amount <= 0 || from.id === to.id) {
            if (preview) preview.textContent = "Choose two different denominations and enter a positive whole number.";
            return;
          }
          const result = (amount * from.value) / to.value;
          if (amount > fromAvailable) {
            preview.textContent = `Only ${fromAvailable} ${from.name} available.`;
            preview.classList.add("invalid");
          } else if (!Number.isInteger(result)) {
            preview.textContent = "This selection does not produce a whole-number conversion.";
            preview.classList.add("invalid");
          } else {
            preview.textContent = `${amount} ${from.name} → ${result} ${to.name}`;
            preview.classList.remove("invalid");
          }
        };
        root?.querySelectorAll("input, select").forEach(element => {
          element.addEventListener("change", updatePreview);
          element.addEventListener("input", updatePreview);
        });
        const toSelect = root?.querySelector('[name="toDenominationId"]');
        if (toSelect?.options.length > 1) toSelect.selectedIndex = 1;
        updatePreview();
      },
      close: () => finish(null)
    }, { width: 520 }).render(true);
  });
}

async function promptDepositItem(actors) {
  const options = actors.flatMap(actor => actor.items
    .filter(item => allowedItemTypes().includes(item.type))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => `<option value="${escape(actor.id)}|${escape(item.id)}">${escape(actor.name)} — ${escape(item.name)} (${escape(labelItemType(item.type))})</option>`)
  ).join("");
  if (!options) {
    ui.notifications.warn("No eligible Items were found on controlled Actors.");
    return null;
  }
  return await new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    new Dialog({
      title: "Deposit Item",
      content: `<form><div class="form-group"><label>Item</label><select name="item">${options}</select></div><p class="notes">Depositing moves the selected Item from its Actor into the shared vault.</p></form>`,
      buttons: {
        deposit: {
          label: "Deposit",
          callback: html => {
            const [sourceActorId, itemId] = String(rootOf(html)?.querySelector('[name="item"]')?.value || "").split("|");
            finish(sourceActorId && itemId ? { sourceActorId, itemId } : null);
          }
        },
        cancel: { label: "Cancel", callback: () => finish(null) }
      },
      default: "deposit",
      close: () => finish(null)
    }).render(true);
  });
}

async function promptReorderCurrencies(definitions) {
  const rows = definitions.map(currency => `
    <li data-currency-id="${escape(currency.id)}">
      <span class="qm-reorder-handle"><i class="fas fa-grip-lines"></i></span>
      <strong>${escape(currency.name)}</strong>
      <button type="button" data-action="move-up" title="Move left"><i class="fas fa-arrow-up"></i></button>
      <button type="button" data-action="move-down" title="Move right"><i class="fas fa-arrow-down"></i></button>
    </li>`).join("");

  return await new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    new Dialog({
      title: "Reorder Currencies",
      content: `<ol class="qm-reorder-list">${rows}</ol>`,
      buttons: {
        save: {
          label: "Save Order",
          callback: html => finish([...rootOf(html).querySelectorAll("[data-currency-id]")].map(row => row.dataset.currencyId))
        },
        cancel: { label: "Cancel", callback: () => finish(null) }
      },
      default: "save",
      render: html => {
        const root = rootOf(html);
        root?.addEventListener("click", event => {
          const button = event.target.closest("[data-action]");
          const row = button?.closest("[data-currency-id]");
          if (!button || !row) return;
          if (button.dataset.action === "move-up") row.previousElementSibling?.before(row);
          if (button.dataset.action === "move-down") row.nextElementSibling?.after(row);
        });
      },
      close: () => finish(null)
    }, { width: 480 }).render(true);
  });
}

function formatBalanceMap(map, currency) {
  return currency.denominations.map(denomination => `${denomination.name}: ${Number(map?.[denomination.id] ?? 0)}`).join(", ");
}

function transactionDetails(entry, definitions = currencyDefinitions()) {
  if (entry.type === "currency-conversion") return `${entry.amount} ${entry.fromName} → ${entry.result} ${entry.toName}`;
  if (entry.type === "currency-normalization") {
    const currency = definitions.find(candidate => candidate.id === entry.currencyId);
    return currency ? `${formatBalanceMap(entry.before, currency)} → ${formatBalanceMap(entry.after, currency)}` : `Total base value ${entry.totalBaseValue}`;
  }
  if (entry.type === "currency" || entry.type === "resource") {
    const sign = Number(entry.amount) > 0 ? "+" : "";
    return `${sign}${entry.amount} · ${entry.before} → ${entry.after}`;
  }
  if (entry.type === "currency-deletion") return `Discarded balance: ${entry.discardedBalance ?? 0}`;
  if (entry.type === "currency-configuration") {
    const changes = entry.changes || {};
    const parts = [];
    if (changes.addedCurrencies?.length) parts.push(`Added ${changes.addedCurrencies.join(", ")}`);
    if (changes.removedCurrencies?.length) parts.push(`Removed ${changes.removedCurrencies.join(", ")}`);
    if (changes.renamedCurrencies?.length) parts.push(changes.renamedCurrencies.map(change => `${change.before} → ${change.after}`).join(", "));
    if (changes.addedDenominations?.length) parts.push(`Added ${changes.addedDenominations.join(", ")}`);
    if (changes.removedDenominations?.length) parts.push(`Removed ${changes.removedDenominations.join(", ")}`);
    return parts.join(" · ") || entry.action;
  }
  if (entry.type === "item") {
    if (entry.action === "deposit" || entry.action === "import") return `${entry.source} → Party Inventory`;
    if (entry.action === "withdraw") return `Party Inventory → ${entry.destination}`;
    if (entry.action === "change-image") return "Item image changed";
  }
  return entry.details || "";
}

function transactionLabel(entry) {
  const labels = {
    convert: "Conversion",
    normalize: "Normalize",
    deposit: "Deposit",
    import: "Deposit",
    withdraw: "Withdraw",
    add: "Deposit",
    subtract: "Withdraw",
    "set-balance": "Adjustment",
    delete: "Delete",
    "change-image": "Edit",
    rename: "Edit",
    "full-edit": "Edit",
    "add-currency": "Create",
    "remove-currency": "Delete",
    "discard-balance": "Delete",
    "change-denomination-image": "Edit",
    reorder: "Reorder"
  };
  return labels[entry.action] ?? entry.action ?? "Change";
}

function transactionIcon(entry) {
  if (["deposit", "import", "add"].includes(entry.action)) return "fa-arrow-up";
  if (["withdraw", "subtract"].includes(entry.action)) return "fa-arrow-down";
  if (entry.action === "convert") return "fa-right-left";
  if (entry.action === "normalize") return "fa-arrow-down-wide-short";
  if (["delete", "remove-currency", "discard-balance"].includes(entry.action)) return "fa-trash";
  return "fa-pen";
}

export class QuartermasterBWApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "quartermaster-burning-wheel-app",
      title: MODULE_TITLE,
      template: `modules/${MODULE_ID}/templates/inventory.hbs`,
      width: 1220,
      height: 820,
      resizable: true,
      tabs: [{ navSelector: ".qm-tabs", contentSelector: ".qm-content", initial: "inventory" }],
      dragDrop: [{ dragSelector: ".qm-item-row", dropSelector: ".qm-window" }]
    });
  }

  constructor(options = {}) {
    super(options);
    this.selectedActorId = null;
    this.inventorySearch = "";
    this.inventoryCategory = "all";
    this.inventorySort = "name";
    this._refreshHook = Hooks.on(`${MODULE_ID}.refresh`, () => this.render(false));
  }

  async close(options) {
    if (this._refreshHook) Hooks.off(`${MODULE_ID}.refresh`, this._refreshHook);
    const result = await super.close(options);
    app = null;
    return result;
  }

  async getData() {
    const vault = getVault();
    const actors = controlledCharacters();
    if (!this.selectedActorId || !actors.some(actor => actor.id === this.selectedActorId)) this.selectedActorId = actors[0]?.id ?? null;

    const balances = currencyBalances(vault);
    const definitions = currencyDefinitions();
    const currencies = definitions.map(currency => {
      const base = currency.denominations.find(denomination => denomination.value === 1);
      return {
        ...currency,
        baseName: base?.name ?? "base unit",
        canConvert: currency.denominations.length > 1,
        denominations: currency.denominations.map(denomination => ({
          ...denomination,
          balance: Number(balances[denomination.id] ?? 0)
        }))
      };
    });

    let itemRows = (vault?.items ?? []).filter(item => allowedItemTypes().includes(item.type)).map(item => {
      const category = itemCategory(item);
      return {
        id: item.id,
        uuid: item.uuid,
        name: item.name,
        type: item.type,
        typeLabel: labelItemType(item.type),
        category,
        canClassify: item.type === "possession",
        categoryLabel: category === "gear" ? "Gear" : category === "possessions" ? "Possession" : "",
        img: item.img,
        quantity: itemQuantity(item),
        description: stripHtml(displayDescription(item)) || "No description provided."
      };
    });

    const search = this.inventorySearch.trim().toLowerCase();
    if (search) itemRows = itemRows.filter(item => [item.name, item.typeLabel, item.description].some(value => value.toLowerCase().includes(search)));
    if (this.inventoryCategory !== "all") itemRows = itemRows.filter(item => item.category === this.inventoryCategory);
    itemRows.sort((a, b) => this.inventorySort === "type"
      ? a.typeLabel.localeCompare(b.typeLabel) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name));

    const rawLog = transactions(vault).slice(0, 100).map(entry => ({
      ...entry,
      details: transactionDetails(entry, definitions),
      label: transactionLabel(entry),
      icon: transactionIcon(entry),
      when: new Date(entry.timestamp).toLocaleString()
    }));

    const categories = [
      { id: "all", name: "All Items" },
      { id: "weapons", name: "Weapons" },
      { id: "armor", name: "Armor" },
      { id: "gear", name: "Gear" },
      { id: "possessions", name: "Possessions" },
      { id: "property", name: "Property" },
      { id: "spells", name: "Spells" }
    ].filter(category => category.id !== "spells" || game.settings.get(MODULE_ID, SETTINGS.ALLOW_SPELLS));

    return {
      isGM: game.user.isGM,
      hasVault: Boolean(vault),
      items: itemRows,
      itemCount: itemRows.length,
      inventorySearch: this.inventorySearch,
      inventoryCategories: categories.map(category => ({ ...category, selected: category.id === this.inventoryCategory })),
      sortOptions: [
        { id: "name", name: "Name", selected: this.inventorySort === "name" },
        { id: "type", name: "Type", selected: this.inventorySort === "type" }
      ],
      currencies,
      currencyCount: currencies.length,
      resources: resources(vault),
      transactions: rawLog,
      recentTransactions: rawLog.slice(0, 5),
      actors: actors.map(actor => ({ id: actor.id, name: actor.name, selected: actor.id === this.selectedActorId })),
      allowedTypes: allowedItemTypes().join(", "),
      buttonLabel: game.settings.get(MODULE_ID, SETTINGS.BUTTON_LABEL),
      allowSpells: game.settings.get(MODULE_ID, SETTINGS.ALLOW_SPELLS),
      maxLog: game.settings.get(MODULE_ID, SETTINGS.MAX_LOG)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[name="targetActor"]').on("change", event => { this.selectedActorId = event.currentTarget.value || null; });
    html.find('[name="inventorySearch"]').on("input", event => { this.inventorySearch = event.currentTarget.value; this.render(false); });
    html.find('[name="inventoryCategory"]').on("change", event => { this.inventoryCategory = event.currentTarget.value; this.render(false); });
    html.find('[name="inventorySort"]').on("change", event => { this.inventorySort = event.currentTarget.value; this.render(false); });

    html.find("[data-action='withdraw']").on("click", event => this._withdraw(event));
    html.find("[data-action='delete-item']").on("click", event => this._deleteItem(event));
    html.find("[data-action='open-item']").on("click", event => this._openItem(event));
    html.find("[data-action='change-item-image']").on("click", event => this._changeItemImage(event));
    html.find("[data-action='classify-item']").on("click", event => this._classifyItem(event));
    html.find("[data-action='deposit-items']").on("click", () => this._depositItem());

    html.find("[data-action='currency-adjust']").on("click", event => this._adjustCurrency(event));
    html.find("[data-action='currency-balance']").on("change", event => this._setCurrencyBalance(event));
    html.find("[data-action='currency-convert']").on("click", event => this._convertCurrency(event));
    html.find("[data-action='currency-normalize']").on("click", event => this._normalizeCurrency(event));
    html.find("[data-action='quick-rename-currency']").on("click", event => this._quickRenameCurrency(event));
    html.find("[data-action='edit-currency']").on("click", event => this._editCurrency(event));
    html.find("[data-action='add-denomination-to-currency']").on("click", event => this._editCurrency(event, true));
    html.find("[data-action='change-denomination-image']").on("click", event => this._changeDenominationImage(event));
    html.find("[data-action='add-currency']").on("click", () => this._addCurrency());
    html.find("[data-action='remove-currency']").on("click", event => this._removeCurrency(event));
    html.find("[data-action='reorder-currencies']").on("click", () => this._reorderCurrencies());

    html.find("[data-action='resource-adjust']").on("click", event => this._adjustResource(event));
    html.find("[data-action='add-resource']").on("click", () => this._addResource());
    html.find("[data-action='remove-resource']").on("click", event => this._removeResource(event));
    html.find("[data-action='open-module-settings']").on("click", () => game.settings.sheet?.render(true));
    html.find("[data-action='view-transactions']").on("click", () => this._tabs?.[0]?.activate("transactions"));
  }

  _onDragStart(event) {
    const row = event.currentTarget.closest(".qm-item-row");
    const item = getVault()?.items.get(row?.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "QuartermasterBWItem", uuid: item.uuid, itemId: item.id, sourceActorId: getVault().id, quartermasterBW: true }));
  }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = TextEditor.getDragEventData(event); } catch { try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; } }
    if (data?.quartermasterBW) return;
    try {
      const item = data.uuid ? await fromUuid(data.uuid) : null;
      if (item?.parent instanceof Actor) await requestOperation("deposit", { sourceActorId: item.parent.id, itemId: item.id });
      else if (data.uuid) await requestOperation("import", { uuid: data.uuid });
      else throw new Error("Only Item documents can be added to the vault.");
      ui.notifications.info(`${MODULE_TITLE}: item added to the vault.`);
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _depositItem() {
    const selection = await promptDepositItem(controlledCharacters());
    if (!selection) return;
    try {
      await requestOperation("deposit", selection);
      ui.notifications.info(`${MODULE_TITLE}: item deposited.`);
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _withdraw(event) {
    if (!this.selectedActorId) return ui.notifications.warn("Select a destination Actor first.");
    try {
      await requestOperation("withdraw", { itemId: event.currentTarget.dataset.itemId, targetActorId: this.selectedActorId });
      ui.notifications.info(`${MODULE_TITLE}: item transferred.`);
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  _openItem(event) {
    getVault()?.items.get(event.currentTarget.dataset.itemId)?.sheet?.render(true);
  }

  async _changeItemImage(event) {
    const item = getVault()?.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    const img = await chooseImage(item.img);
    if (!img) return;
    try { await requestOperation("updateItemImage", { itemId: item.id, img }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _classifyItem(event) {
    const item = getVault()?.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    const current = item.getFlag(MODULE_ID, FLAGS.ITEM_CATEGORY) === "gear" ? "gear" : "possession";
    const next = await new Promise(resolve => {
      new Dialog({
        title: `Classify ${item.name}`,
        content: `<form><div class="form-group"><label>Inventory section</label><select name="category"><option value="possession" ${current === "possession" ? "selected" : ""}>Possessions</option><option value="gear" ${current === "gear" ? "selected" : ""}>Gear</option></select></div></form>`,
        buttons: {
          save: { label: "Save", callback: html => resolve(rootOf(html)?.querySelector('[name="category"]')?.value) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "save",
        close: () => resolve(null)
      }).render(true);
    });
    if (!next) return;
    try { await requestOperation("setItemCategory", { itemId: item.id, category: next }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _deleteItem(event) {
    const item = getVault()?.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    const ok = await Dialog.confirm({ title: "Delete vault item?", content: `<p>Delete <strong>${escape(item.name)}</strong> permanently?</p>` });
    if (!ok) return;
    try { await requestOperation("deleteItem", { itemId: item.id }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _adjustCurrency(event) {
    const denominationId = event.currentTarget.dataset.denominationId;
    const match = currencyDefinitions().flatMap(currency => currency.denominations.map(denomination => ({ currency, denomination }))).find(entry => entry.denomination.id === denominationId);
    const amount = await new Promise(resolve => {
      new Dialog({
        title: `Adjust ${match?.denomination.name ?? "denomination"}`,
        content: `<form><div class="form-group"><label>Change by</label><input type="number" name="amount" value="1" step="1" autofocus></div><p class="notes">Use a negative value to subtract. The adjustment will be recorded.</p></form>`,
        buttons: {
          apply: { label: "Apply", callback: html => resolve(Number(rootOf(html)?.querySelector('[name="amount"]')?.value)) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        }, default: "apply", close: () => resolve(null)
      }).render(true);
    });
    if (amount === null || !Number.isInteger(amount)) return;
    try { await requestOperation("currency", { denominationId, delta: amount }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _setCurrencyBalance(event) {
    const denominationId = event.currentTarget.dataset.denominationId;
    const value = Number(event.currentTarget.value);
    try { await requestOperation("setCurrencyBalance", { denominationId, value }); this.render(false); } catch (error) { ui.notifications.error(error.message); this.render(false); }
  }

  async _convertCurrency(event) {
    const currency = currencyDefinitions().find(candidate => candidate.id === event.currentTarget.dataset.currencyId);
    const conversion = await promptConversion(currency, currencyBalances());
    if (!conversion) return;
    try {
      const result = await requestOperation("convertCurrency", conversion);
      ui.notifications.info(`${MODULE_TITLE}: converted into ${result.result} ${result.result === 1 ? "unit" : "units"}.`);
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _normalizeCurrency(event) {
    const currency = currencyDefinitions().find(candidate => candidate.id === event.currentTarget.dataset.currencyId);
    if (!currency) return;
    const ok = await Dialog.confirm({
      title: `Normalize ${escape(currency.name)}?`,
      content: `<p>Restructure the entire <strong>${escape(currency.name)}</strong> balance into the most efficient combination of denominations?</p><p>This preserves total base value and records a transaction.</p>`
    });
    if (!ok) return;
    try { await requestOperation("normalizeCurrency", { currencyId: currency.id }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _quickRenameCurrency(event) {
    const id = event.currentTarget.dataset.currencyId;
    const definitions = currencyDefinitions();
    const currency = definitions.find(candidate => candidate.id === id);
    if (!currency) return;
    const name = await promptText({ title: "Rename Currency", label: "Currency Name", value: currency.name });
    if (!name || name === currency.name) return;
    currency.name = name;
    try { await requestOperation("saveCurrencies", { definitions, action: "rename", reason: `Renamed Currency to ${name}` }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _addCurrency() {
    const edited = await promptCurrencyDefinition(null, {});
    if (!edited) return;
    const definitions = currencyDefinitions();
    definitions.push(edited.definition);
    try {
      await requestOperation("saveCurrencies", { definitions, balanceUpdates: edited.balanceUpdates, action: "add-currency" });
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _editCurrency(event, appendDenomination = false) {
    const id = event.currentTarget.dataset.currencyId;
    const definitions = currencyDefinitions();
    const index = definitions.findIndex(currency => currency.id === id);
    if (index < 0) return;
    const before = definitions[index];
    const balances = currencyBalances();
    const edited = await promptCurrencyDefinition(before, balances, { appendDenomination });
    if (!edited) return;

    const retained = new Set(edited.definition.denominations.map(denomination => denomination.id));
    const removed = before.denominations.filter(denomination => !retained.has(denomination.id));
    const nonZero = removed.filter(denomination => Number(balances[denomination.id] ?? 0) !== 0);
    let allowNonZeroDeletion = false;
    if (nonZero.length) {
      const summary = nonZero.map(denomination => `<li>${escape(denomination.name)}: ${Number(balances[denomination.id] ?? 0)}</li>`).join("");
      allowNonZeroDeletion = await Dialog.confirm({
        title: "Delete nonzero denomination balances?",
        content: `<p>The following removed denominations still hold value:</p><ul>${summary}</ul><p><strong>This permanently discards those balances.</strong></p>`
      });
      if (!allowNonZeroDeletion) return;
    }

    definitions[index] = edited.definition;
    try {
      await requestOperation("saveCurrencies", {
        definitions,
        balanceUpdates: edited.balanceUpdates,
        allowNonZeroDeletion,
        action: "full-edit"
      });
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _changeDenominationImage(event) {
    const denominationId = event.currentTarget.dataset.denominationId;
    const definitions = currencyDefinitions();
    let target = null;
    for (const currency of definitions) {
      const denomination = currency.denominations.find(candidate => candidate.id === denominationId);
      if (denomination) { target = denomination; break; }
    }
    if (!target) return;
    const img = await chooseImage(target.img || DEFAULT_DENOMINATION_IMAGE);
    if (!img) return;
    target.img = img;
    try { await requestOperation("saveCurrencies", { definitions, action: "change-denomination-image" }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _removeCurrency(event) {
    const id = event.currentTarget.dataset.currencyId;
    const definitions = currencyDefinitions();
    if (definitions.length <= 1) return ui.notifications.warn("At least one Currency column must remain.");
    const currency = definitions.find(candidate => candidate.id === id);
    if (!currency) return;
    const balances = currencyBalances();
    const nonZero = currency.denominations.filter(denomination => Number(balances[denomination.id] ?? 0) !== 0);

    const first = await Dialog.confirm({
      title: `Delete ${escape(currency.name)}?`,
      content: `<p>Delete this entire Currency column? Its transaction history will remain.</p>`
    });
    if (!first) return;

    let allowNonZeroDeletion = false;
    if (nonZero.length) {
      const summary = nonZero.map(denomination => `<li>${escape(denomination.name)}: ${Number(balances[denomination.id] ?? 0)}</li>`).join("");
      allowNonZeroDeletion = await Dialog.confirm({
        title: "Permanent balance deletion",
        content: `<p><strong>${escape(currency.name)}</strong> still holds:</p><ul>${summary}</ul><p>Delete the Currency and permanently discard these balances?</p>`
      });
      if (!allowNonZeroDeletion) return;
    }

    try {
      await requestOperation("saveCurrencies", {
        definitions: definitions.filter(candidate => candidate.id !== id),
        allowNonZeroDeletion,
        action: "remove-currency"
      });
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _reorderCurrencies() {
    const definitions = currencyDefinitions();
    const order = await promptReorderCurrencies(definitions);
    if (!order) return;
    const byId = new Map(definitions.map(currency => [currency.id, currency]));
    const reordered = order.map(id => byId.get(id)).filter(Boolean);
    try { await requestOperation("saveCurrencies", { definitions: reordered, action: "reorder" }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _adjustResource(event) {
    const resourceId = event.currentTarget.dataset.resourceId;
    const amount = await new Promise(resolve => {
      new Dialog({
        title: "Adjust Shared Resource",
        content: '<form><div class="form-group"><label>Change by</label><input type="number" name="amount" value="1" autofocus></div></form>',
        buttons: {
          apply: { label: "Apply", callback: html => resolve(Number(rootOf(html)?.querySelector('[name="amount"]')?.value)) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        }, default: "apply", close: () => resolve(null)
      }).render(true);
    });
    if (amount === null || !Number.isFinite(amount)) return;
    try { await requestOperation("resource", { resourceId, delta: amount }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _addResource() {
    const name = await promptText({ title: "Add Shared Resource", label: "Resource Name", value: "New Resource", confirmLabel: "Add" });
    if (!name) return;
    const list = resources();
    list.push({ id: foundry.utils.randomID(), name, value: 0, max: null });
    try { await requestOperation("saveResources", { resources: list }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _removeResource(event) {
    const id = event.currentTarget.dataset.resourceId;
    const list = resources();
    const resource = list.find(candidate => candidate.id === id);
    if (!resource) return;
    if (Number(resource.value ?? 0) !== 0) {
      const ok = await Dialog.confirm({ title: "Delete nonzero resource?", content: `<p>${escape(resource.name)} currently has a value of ${Number(resource.value)}. Delete it permanently?</p>` });
      if (!ok) return;
    }
    try { await requestOperation("saveResources", { resources: list.filter(candidate => candidate.id !== id) }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }
}

let app;
export function openQuartermaster() {
  if (!app) app = new QuartermasterBWApp();
  app.render(true);
  return app;
}

export function injectSidebarButton(_app, html) {
  const root = rootOf(html);
  if (!root || root.querySelector(".qm-bw-sidebar-button")) return;
  const label = game.settings.get(MODULE_ID, SETTINGS.BUTTON_LABEL);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "qm-bw-sidebar-button";
  button.innerHTML = `<i class="fas fa-box-open"></i> ${escape(label)}`;
  button.addEventListener("click", () => openQuartermaster());
  const header = root.querySelector(".directory-header") ?? root.querySelector("header");
  header?.append(button);
}
