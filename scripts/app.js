import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.js";
import { allowedItemTypes, displayDescription, itemQuantity } from "./adapter.js";
import { currencyBalances, currencyDefinitions, resources, transactions } from "./ledger.js";
import { requestOperation } from "./operations.js";
import { getVault } from "./vault.js";

function controlledCharacters() {
  return game.actors.filter(actor => {
    if (!["character", "npc"].includes(actor.type)) return false;
    if (actor.getFlag(MODULE_ID, "isVault")) return false;
    return game.user.isGM || actor.isOwner;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function promptNumber({ title, label, initial = "" }) {
  return await new Promise(resolve => {
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${foundry.utils.escapeHTML(label)}</label><input type="number" name="value" value="${initial}" step="any" autofocus></div></form>`,
      buttons: {
        ok: { label: "Apply", callback: html => resolve(Number(html.find('[name="value"]').val())) },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "ok",
      close: () => resolve(null)
    }).render(true);
  });
}

export class QuartermasterBWApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "quartermaster-burning-wheel-app",
      title: MODULE_TITLE,
      template: `modules/${MODULE_ID}/templates/inventory.hbs`,
      width: 820,
      height: 700,
      resizable: true,
      tabs: [{ navSelector: ".qm-tabs", contentSelector: ".qm-content", initial: "inventory" }],
      dragDrop: [{ dragSelector: ".qm-item-row", dropSelector: ".qm-window" }]
    });
  }

  constructor(options = {}) {
    super(options);
    this.selectedActorId = null;
    this._refreshHook = Hooks.on(`${MODULE_ID}.refresh`, () => this.render(false));
  }

  async close(options) {
    if (this._refreshHook) Hooks.off(`${MODULE_ID}.refresh`, this._refreshHook);
    return super.close(options);
  }

  async getData() {
    const vault = getVault();
    const actors = controlledCharacters();
    if (!this.selectedActorId || !actors.some(a => a.id === this.selectedActorId)) this.selectedActorId = actors[0]?.id ?? null;
    const balances = currencyBalances(vault);
    const currencies = currencyDefinitions().map(c => ({ ...c, balance: Number(balances[c.id] ?? 0) }));
    const itemRows = (vault?.items ?? []).filter(item => allowedItemTypes().includes(item.type)).map(item => ({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      type: item.type,
      img: item.img,
      quantity: itemQuantity(item),
      description: displayDescription(item)
    })).sort((a, b) => a.name.localeCompare(b.name));
    const log = transactions(vault).slice(0, 100).map(entry => ({ ...entry, when: new Date(entry.timestamp).toLocaleString() }));
    return {
      isGM: game.user.isGM,
      hasVault: Boolean(vault),
      items: itemRows,
      currencies,
      resources: resources(vault),
      transactions: log,
      actors: actors.map(a => ({ id: a.id, name: a.name, selected: a.id === this.selectedActorId })),
      allowedTypes: allowedItemTypes().join(", ")
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[name="targetActor"]').on("change", ev => { this.selectedActorId = ev.currentTarget.value || null; });
    html.find("[data-action='withdraw']").on("click", ev => this._withdraw(ev));
    html.find("[data-action='delete-item']").on("click", ev => this._deleteItem(ev));
    html.find("[data-action='currency-adjust']").on("click", ev => this._adjustCurrency(ev));
    html.find("[data-action='resource-adjust']").on("click", ev => this._adjustResource(ev));
    html.find("[data-action='add-currency']").on("click", () => this._addCurrency());
    html.find("[data-action='remove-currency']").on("click", ev => this._removeCurrency(ev));
    html.find("[data-action='add-resource']").on("click", () => this._addResource());
    html.find("[data-action='remove-resource']").on("click", ev => this._removeResource(ev));
    html.find("[data-action='open-item']").on("dblclick", ev => getVault()?.items.get(ev.currentTarget.dataset.itemId)?.sheet?.render(true));
  }

  _onDragStart(event) {
    const row = event.currentTarget.closest(".qm-item-row");
    const item = getVault()?.items.get(row?.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid, itemId: item.id, sourceActorId: getVault().id, quartermasterBW: true }));
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

  async _withdraw(event) {
    if (!this.selectedActorId) return ui.notifications.warn("Select a destination Actor first.");
    try {
      await requestOperation("withdraw", { itemId: event.currentTarget.dataset.itemId, targetActorId: this.selectedActorId });
      ui.notifications.info(`${MODULE_TITLE}: item transferred.`);
      this.render(false);
    } catch (error) { ui.notifications.error(error.message); }
  }

  async _deleteItem(event) {
    const item = getVault()?.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    const ok = await Dialog.confirm({ title: "Delete vault item?", content: `<p>Delete <strong>${foundry.utils.escapeHTML(item.name)}</strong> permanently?</p>` });
    if (!ok) return;
    try { await requestOperation("deleteItem", { itemId: item.id }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _adjustCurrency(event) {
    const currencyId = event.currentTarget.dataset.currencyId;
    const amount = await promptNumber({ title: "Adjust shared currency", label: "Change by (negative to subtract)" });
    if (amount === null || !Number.isFinite(amount)) return;
    try { await requestOperation("currency", { currencyId, delta: amount }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _adjustResource(event) {
    const resourceId = event.currentTarget.dataset.resourceId;
    const amount = await promptNumber({ title: "Adjust shared resource", label: "Change by (negative to subtract)" });
    if (amount === null || !Number.isFinite(amount)) return;
    try { await requestOperation("resource", { resourceId, delta: amount }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _addCurrency() {
    const name = await Dialog.prompt({ title: "Add currency", content: '<div class="form-group"><label>Name</label><input name="name" autofocus></div>', callback: html => String(html.find('[name="name"]').val() || "").trim() });
    if (!name) return;
    const definitions = currencyDefinitions();
    definitions.push({ id: foundry.utils.randomID(), name, abbreviation: name.slice(0, 3).toLowerCase() });
    try { await requestOperation("saveCurrencies", { definitions }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _removeCurrency(event) {
    const id = event.currentTarget.dataset.currencyId;
    const definitions = currencyDefinitions().filter(c => c.id !== id);
    if (!definitions.length) return ui.notifications.warn("At least one currency must remain.");
    try { await requestOperation("saveCurrencies", { definitions }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _addResource() {
    const name = await Dialog.prompt({ title: "Add resource", content: '<div class="form-group"><label>Name</label><input name="name" autofocus></div>', callback: html => String(html.find('[name="name"]').val() || "").trim() });
    if (!name) return;
    const list = resources();
    list.push({ id: foundry.utils.randomID(), name, value: 0, max: null });
    try { await requestOperation("saveResources", { resources: list }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }

  async _removeResource(event) {
    const id = event.currentTarget.dataset.resourceId;
    const list = resources().filter(r => r.id !== id);
    try { await requestOperation("saveResources", { resources: list }); this.render(false); } catch (error) { ui.notifications.error(error.message); }
  }
}

let app;
export function openQuartermaster() {
  if (!app) app = new QuartermasterBWApp();
  app.render(true);
  return app;
}

export function injectSidebarButton(_app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
  if (!root || root.querySelector(".qm-bw-sidebar-button")) return;
  const label = game.settings.get(MODULE_ID, SETTINGS.BUTTON_LABEL);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "qm-bw-sidebar-button";
  button.innerHTML = `<i class="fas fa-box-open"></i> ${foundry.utils.escapeHTML(label)}`;
  button.addEventListener("click", () => openQuartermaster());
  const header = root.querySelector(".directory-header") ?? root.querySelector("header");
  header?.append(button);
}
