// Bramble & Board, the Circle, the Quench, and the Still share #panel. Buyback stays in the session and is not saved.

import { raiseRank, upgradeCost } from "../sim/balance.js";
import { RECIPES, tryCraft, tryUpgrade } from "../sim/items.js";

export const PACK_CAP = 24;
export const STASH_CAP = 48;
export const BUYBACK_CAP = 8;
export const DRAUGHT_PRICE = 25;
export const DRAUGHT_STACK = 20;
export const DRAUGHT_HEAL = 45;
const PANEL_TITLES = { store: "Bramble & Board", smith: "The Quench", trainer: "The Circle", still: "The Still", bank: "The Counting House", inn: "The Banked Fire" };
const RARITY_EDGE = ["#e7d7b4", "#8ed15a", "#7eb6ef", "#d4a03a"];

export function vendorValue(item) {
  const ilvl = Math.max(0, Math.floor(Number(item && item.ilvl) || 0));
  const rarity = Math.max(0, Math.floor(Number(item && item.rarity) || 0));
  return 4 * ilvl * (1 + rarity);
}

// Integer tenths. Not a 0.3 multiply. Draughts are a flat 25 and do not use this.
export function sellValue(item) {
  return Math.floor(vendorValue(item) * 3 / 10);
}

export function addMaterial(materials, key, amount) {
  if (!materials || (key !== "heartwood" && key !== "slag" && key !== "rootfiber" && key !== "emberglass")) return 0;
  const cur = Math.max(0, Math.min(999, Math.floor(Number(materials[key]) || 0)));
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  const next = Math.min(999, cur + add);
  materials[key] = next;
  return next - cur;
}

function isGear(item) {
  return !!item && item.kind !== "consumable";
}

function draughtName(id) {
  return id === "draught-mp" ? "Mana Draught" : "Health Draught";
}

function makeDraught(session, id, stack) {
  const n = Math.max(1, Math.floor(Number(session.nextUid) || 1));
  session.nextUid = n + 1;
  return {
    uid: "buy-" + n,
    kind: "consumable",
    slot: null,
    consumableId: id,
    charges: 1,
    stack,
    rarity: 0,
    ilvl: 1,
    baseId: null,
    themeId: 0,
    affixes: [],
    name: draughtName(id)
  };
}

export function addDraught(pack, id, count, make) {
  let left = Math.max(0, Math.floor(Number(count) || 0));
  let added = 0;
  for (let i = 0; i < pack.length && left > 0; i++) {
    const item = pack[i];
    if (!item || item.kind !== "consumable" || item.consumableId !== id) continue;
    const room = DRAUGHT_STACK - Math.floor(Number(item.stack) || 0);
    if (room <= 0) continue;
    const take = Math.min(room, left);
    item.stack = Math.floor(Number(item.stack) || 0) + take;
    left -= take;
    added += take;
  }
  while (left > 0 && pack.length < PACK_CAP) {
    const take = Math.min(DRAUGHT_STACK, left);
    pack.push(make(id, take));
    left -= take;
    added += take;
  }
  return added;
}

function itemLabel(item) {
  const name = item && typeof item.name === "string" && item.name ? item.name : (isGear(item) ? "Gear" : "Supplies");
  const stack = item && item.kind === "consumable" && Math.floor(Number(item.stack) || 0) > 1 ? " ×" + Math.floor(Number(item.stack) || 0) : "";
  return (name + stack).slice(0, 80);
}

const TRAINER_ROWS = [
  ["edge", "Edge"],
  ["bulwark", "Bulwark"],
  ["mend", "Mend"],
  ["delver", "Delver"]
];

export function attachPanels(rt) {
  const buyback = [];
  let amountDraft = "";
  let panelKind = "store";
  const hud = document.getElementById("hud");
  const vitals = document.getElementById("vitals");
  const panel = document.createElement("section");
  panel.id = "panel";
  panel.className = "plaque";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("aria-label", "Bramble & Board");
  if (hud && vitals) hud.insertBefore(panel, vitals.nextSibling);
  else if (hud) hud.appendChild(panel);

  function placePanel() {
    const node = document.getElementById("vitals");
    if (!node) return;
    const rect = node.getBoundingClientRect();
    panel.style.top = Math.round(rect.bottom + 8) + "px";
    panel.style.left = Math.round(rect.left) + "px";
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(act, text, attrs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.setAttribute("data-act", act);
    btn.textContent = text;
    if (attrs) {
      const keys = Object.keys(attrs);
      for (let i = 0; i < keys.length; i++) btn.setAttribute(keys[i], attrs[keys[i]]);
    }
    return btn;
  }

  function shake(btn) {
    if (!btn) return;
    btn.classList.remove("deny");
    void btn.offsetWidth;
    btn.classList.add("deny");
  }

  // Keeper name, then what they are saying, with a control to hear more.
  function keeperLine() {
    const st = rt.panelStation;
    if (st && st.keeperLine) panel.appendChild(el("p", "panel-line keeper", st.keeperLine));
    const talk = rt.keeperTalk ? rt.keeperTalk(panelKind, false) : null;
    if (!talk || !talk.line) return;
    panel.appendChild(el("p", "panel-talk", "\u201c" + talk.line + "\u201d"));
    const row = el("div", "row");
    row.appendChild(button("talk", talk.index + 1 < talk.count ? "Ask more" : "Start over"));
    panel.appendChild(row);
  }

  function renderInn() {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.appendChild(el("p", "eyebrow", "The Banked Fire"));
    keeperLine();
    const night = rt.townClock ? rt.townClock.phase : 0.5;
    const late = night < 0.24 || night >= 0.7;
    panel.appendChild(el("p", "section-label", "Rooms"));
    const row = el("div", "row");
    row.appendChild(button("rest", late ? "Take a room until morning" : "Rest by the fire until evening"));
    panel.appendChild(row);
    panel.appendChild(button("close", "Close"));
  }

  // The Counting House: gold between purse and bank, gear between pack and stash.
  function renderBank() {
    const session = rt.session;
    const pack = session && Array.isArray(session.pack) ? session.pack : [];
    const stash = session && Array.isArray(session.stash) ? session.stash : [];
    const purse = session ? Math.floor(Number(session.purse) || 0) : 0;
    const bank = session ? Math.floor(Number(session.bank) || 0) : 0;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.appendChild(el("p", "eyebrow", "The Counting House"));
    keeperLine();
    panel.appendChild(el("p", "panel-line", "Purse " + purse + "  \u00b7  Bank " + bank));
    const bankRow = el("div", "row");
    const input = document.createElement("input");
    input.id = "panel-amount";
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.value = amountDraft;
    input.setAttribute("aria-label", "Gold to move");
    input.placeholder = "Gold";
    input.spellcheck = false;
    bankRow.appendChild(input);
    bankRow.appendChild(button("deposit", "Deposit"));
    bankRow.appendChild(button("withdraw", "Withdraw"));
    panel.appendChild(bankRow);
    panel.appendChild(el("p", "section-label", "Pack " + pack.length + " / " + PACK_CAP));
    if (!pack.length) panel.appendChild(el("p", "panel-empty", "The pack is empty."));
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      const row = el("div", "slot pack-row");
      const rarity = Math.max(0, Math.min(3, Math.floor(Number(item && item.rarity) || 0)));
      row.style.borderTop = "2px solid " + RARITY_EDGE[rarity];
      row.appendChild(el("span", "name", itemLabel(item)));
      row.appendChild(button("stash", "Stash", { "data-index": String(i) }));
      panel.appendChild(row);
    }
    panel.appendChild(el("p", "section-label", "Stash " + stash.length + " / " + STASH_CAP));
    if (!stash.length) panel.appendChild(el("p", "panel-empty", "The stash is empty."));
    for (let i = 0; i < stash.length; i++) {
      const item = stash[i];
      const row = el("div", "slot pack-row");
      const rarity = Math.max(0, Math.min(3, Math.floor(Number(item && item.rarity) || 0)));
      row.style.borderTop = "2px solid " + RARITY_EDGE[rarity];
      row.appendChild(el("span", "name", itemLabel(item)));
      row.appendChild(button("pack", "To pack", { "data-index": String(i) }));
      panel.appendChild(row);
    }
    panel.appendChild(button("close", "Close"));
  }

  function recipeRows(station) {
    panel.appendChild(el("p", "section-label", station === "still" ? "Distillations" : "Recipes"));
    for (let i = 0; i < RECIPES.length; i++) {
      const recipe = RECIPES[i];
      if ((recipe.station || "smith") !== station) continue;
      const row = el("div", "row pack-row");
      const gets = recipe.stack ? recipe.count + " " + recipe.name : recipe.name;
      row.appendChild(el("span", "name", gets + "  ·  " + costLine(recipe)));
      row.appendChild(button("craft", station === "still" ? "Distill" : "Craft", { "data-recipe": recipe.id }));
      panel.appendChild(row);
    }
  }

  function renderStill() {
    const session = rt.session;
    const purse = session ? Math.floor(Number(session.purse) || 0) : 0;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.appendChild(el("p", "eyebrow", "The Still"));
    keeperLine();
    panel.appendChild(el("p", "panel-line", "Purse " + purse));
    panel.appendChild(el("p", "panel-line", matLine(session && session.materials)));
    recipeRows("still");
    panel.appendChild(button("close", "Close"));
  }

  function renderTrainer() {
    const session = rt.session;
    const tracks = session && session.tracks ? session.tracks : {};
    const points = session ? Math.floor(Number(session.skillPoints) || 0) : 0;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.appendChild(el("p", "eyebrow", "The Circle"));
    keeperLine();
    panel.appendChild(el("p", "panel-line", "Unspent points " + points));
    for (let i = 0; i < TRAINER_ROWS.length; i++) {
      const key = TRAINER_ROWS[i][0];
      const label = TRAINER_ROWS[i][1];
      const rank = Math.max(0, Math.min(5, Math.floor(Number(tracks[key]) || 0)));
      const row = el("div", "row pack-row");
      row.appendChild(el("span", "name", label + "  " + rank));
      row.appendChild(button("raise", "Raise", { "data-track": key }));
      panel.appendChild(row);
    }
    panel.appendChild(button("close", "Close"));
  }

  function costLine(cost) {
    const parts = [Math.floor(Number(cost && cost.gold) || 0) + " gold"];
    const mats = cost && cost.materials ? cost.materials : {};
    const keys = Object.keys(mats);
    for (let i = 0; i < keys.length; i++) parts.push(mats[keys[i]] + " " + keys[i]);
    return parts.join(", ");
  }

  function matLine(materials) {
    const src = materials || {};
    return "Heartwood " + Math.floor(Number(src.heartwood) || 0)
      + "  ·  Rootfiber " + Math.floor(Number(src.rootfiber) || 0)
      + "  ·  Slag " + Math.floor(Number(src.slag) || 0)
      + "  ·  Emberglass " + Math.floor(Number(src.emberglass) || 0);
  }

  function renderSmith() {
    const session = rt.session;
    const purse = session ? Math.floor(Number(session.purse) || 0) : 0;
    const depth = session ? Math.floor(Number(session.bestDepth) || 0) : 0;
    const pack = session && Array.isArray(session.pack) ? session.pack : [];
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.appendChild(el("p", "eyebrow", "The Quench"));
    keeperLine();
    panel.appendChild(el("p", "panel-line", "Purse " + purse + "  ·  Depth " + depth));
    panel.appendChild(el("p", "panel-line", matLine(session && session.materials)));
    recipeRows("smith");
    let kit = false;
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      if (item && item.kind === "consumable" && item.consumableId === "kit") kit = true;
    }
    panel.appendChild(el("p", "section-label", "Gear"));
    const equipped = session && session.equipped;
    const wornKeys = ["weapon", "offhand", "head", "body", "feet", "trinket"];
    let gearRows = 0;
    for (let i = 0; i < wornKeys.length; i++) {
      const key = wornKeys[i];
      const item = equipped ? equipped[key] : null;
      if (!item || item.kind === "consumable") continue;
      gearRows += 1;
      appendUpgradeRow(item, { "data-slot": key }, kit);
    }
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      if (!item || item.kind === "consumable") continue;
      gearRows += 1;
      appendUpgradeRow(item, { "data-index": String(i) }, kit);
    }
    if (!gearRows) panel.appendChild(el("p", "panel-empty", "No gear to quench."));
    panel.appendChild(button("close", "Close"));
  }

  function appendUpgradeRow(item, attrs, kit) {
    const ilvl = Math.max(0, Math.floor(Number(item.ilvl) || 0));
    const themeId = Math.max(0, Math.floor(Number(item.themeId) || 0));
    const row = el("div", "row pack-row");
    row.appendChild(el("span", "name", itemLabel(item) + "  ·  ilvl " + ilvl));
    row.appendChild(el("span", "affix", costLine(upgradeCost(ilvl, themeId))));
    row.appendChild(button("upgrade", "Upgrade", attrs));
    if (kit) row.appendChild(button("upgrade-kit", "Use kit", attrs));
    panel.appendChild(row);
  }

  function render() {
    if (panelKind === "trainer") {
      renderTrainer();
      return;
    }
    if (panelKind === "smith") {
      renderSmith();
      return;
    }
    if (panelKind === "still") {
      renderStill();
      return;
    }
    if (panelKind === "bank") {
      renderBank();
      return;
    }
    if (panelKind === "inn") {
      renderInn();
      return;
    }
    const session = rt.session;
    const pack = session && Array.isArray(session.pack) ? session.pack : [];
    const purse = session ? Math.floor(Number(session.purse) || 0) : 0;
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    panel.appendChild(el("p", "eyebrow", "Bramble & Board"));
    keeperLine();
    panel.appendChild(el("p", "panel-line", "Purse " + purse));

    const buyRow = el("div", "row");
    buyRow.appendChild(button("buy-hp", "Health draught · " + DRAUGHT_PRICE));
    buyRow.appendChild(button("buy-mp", "Mana draught · " + DRAUGHT_PRICE));
    panel.appendChild(buyRow);

    panel.appendChild(el("p", "section-label", "Pack " + pack.length + " / " + PACK_CAP));
    if (!pack.length) panel.appendChild(el("p", "panel-empty", "The pack is empty."));
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      const row = el("div", "slot pack-row");
      const rarity = Math.max(0, Math.min(3, Math.floor(Number(item && item.rarity) || 0)));
      row.style.borderTop = "2px solid " + RARITY_EDGE[rarity];
      row.appendChild(el("span", "name", itemLabel(item)));
      if (isGear(item) && item.affixes && item.affixes.length) {
        const ids = [];
        for (let k = 0; k < item.affixes.length; k++) {
          if (item.affixes[k] && item.affixes[k].id) ids.push(item.affixes[k].id);
        }
        if (ids.length) row.appendChild(el("span", "affix", ids.join(" ")));
      }
      if (isGear(item) && item.slot) row.appendChild(button("equip", "Equip", { "data-index": String(i) }));
      if (isGear(item)) row.appendChild(button("sell", "Sell · " + sellValue(item), { "data-index": String(i) }));
      panel.appendChild(row);
    }

    const wornKeys = ["weapon", "offhand", "head", "body", "feet", "trinket"];
    const wornLabel = { weapon: "Weapon", offhand: "Offhand", head: "Head", body: "Body", feet: "Feet", trinket: "Trinket" };
    const equipped = session && session.equipped;
    panel.appendChild(el("p", "section-label", "Worn"));
    for (let i = 0; i < wornKeys.length; i++) {
      const key = wornKeys[i];
      const item = equipped ? equipped[key] : null;
      const row = el("div", "slot pack-row");
      const rarity = Math.max(0, Math.min(3, Math.floor(Number(item && item.rarity) || 0)));
      row.style.borderTop = "2px solid " + RARITY_EDGE[rarity];
      const label = wornLabel[key] + " · " + (item ? itemLabel(item) : "Empty");
      row.appendChild(el("span", "name", label.slice(0, 80)));
      if (item) row.appendChild(button("unequip", "Unequip", { "data-slot": key }));
      panel.appendChild(row);
    }

    panel.appendChild(el("p", "section-label", "Buyback " + buyback.length + " / " + BUYBACK_CAP));
    if (!buyback.length) panel.appendChild(el("p", "panel-empty", "No recent sales."));
    for (let i = buyback.length - 1; i >= 0; i--) {
      const entry = buyback[i];
      const row = el("div", "slot pack-row");
      row.appendChild(el("span", "name", itemLabel(entry.item)));
      row.appendChild(button("buyback", "Buy back · " + entry.price, { "data-index": String(i) }));
      panel.appendChild(row);
    }

    panel.appendChild(button("close", "Close"));
  }

  function refuse(btn) {
    const act = btn ? btn.getAttribute("data-act") : "";
    const index = btn ? btn.getAttribute("data-index") : null;
    const track = btn ? btn.getAttribute("data-track") : null;
    const slot = btn ? btn.getAttribute("data-slot") : null;
    const recipe = btn ? btn.getAttribute("data-recipe") : null;
    shake(btn);
    render();
    if (!act) return;
    let live = null;
    if (index != null) live = panel.querySelector('[data-act="' + act + '"][data-index="' + index + '"]');
    else if (track) live = panel.querySelector('[data-act="' + act + '"][data-track="' + track + '"]');
    else if (slot) live = panel.querySelector('[data-act="' + act + '"][data-slot="' + slot + '"]');
    else if (recipe) live = panel.querySelector('[data-act="' + act + '"][data-recipe="' + recipe + '"]');
    else live = panel.querySelector('[data-act="' + act + '"]');
    if (live && live !== btn) shake(live);
  }

  function noteChange() {
    if (!rt.markSave) return;
    rt.markSave(rt.space === "dungeon" ? "dungeon" : "town");
  }

  function amountValue() {
    const input = panel.querySelector("#panel-amount");
    const raw = input ? input.value : amountDraft;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? n : 0;
  }

  function buy(id, btn) {
    const session = rt.session;
    if (!session || !Array.isArray(session.pack)) return;
    if (Math.floor(Number(session.purse) || 0) < DRAUGHT_PRICE) {
      refuse(btn);
      return;
    }
    const added = addDraught(session.pack, id, 1, (cid, stack) => makeDraught(session, cid, stack));
    if (added !== 1) {
      refuse(btn);
      return;
    }
    session.purse = Math.floor(Number(session.purse) || 0) - DRAUGHT_PRICE;
    noteChange();
    render();
  }

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn || !panel.contains(btn)) return;
    const session = rt.session;
    if (!session) return;
    if (!Array.isArray(session.pack)) session.pack = [];
    if (!Array.isArray(session.stash)) session.stash = [];
    const act = btn.getAttribute("data-act");
    const index = btn.hasAttribute("data-index") ? Number(btn.getAttribute("data-index")) : -1;
    if (act === "close") {
      closePanel();
      return;
    }
    if (act === "talk") {
      if (rt.keeperTalk) rt.keeperTalk(panelKind, true);
      render();
      return;
    }
    if (act === "rest") {
      if (rt.restAtInn) rt.restAtInn();
      render();
      return;
    }
    if (act === "raise") {
      const track = btn.getAttribute("data-track");
      if (!raiseRank(session, track)) {
        refuse(btn);
        return;
      }
      if (rt.applyRankStats) rt.applyRankStats();
      if (rt.derivePools) rt.derivePools();
      noteChange();
      render();
      return;
    }
    if (act === "craft") {
      const crafted = tryCraft(session, btn.getAttribute("data-recipe"));
      if (!crafted.ok) {
        if (crafted.reason === "pack" && rt.say) rt.say("Your pack is full.");
        refuse(btn);
        return;
      }
      noteChange();
      render();
      return;
    }
    if (act === "upgrade" || act === "upgrade-kit") {
      const item = upgradeTarget(session, btn);
      const result = tryUpgrade(session, item, act === "upgrade-kit");
      if (!result.ok) {
        refuse(btn);
        return;
      }
      refreshGear();
      noteChange();
      render();
      return;
    }
    if (act === "buy-hp") {
      buy("draught-hp", btn);
      return;
    }
    if (act === "buy-mp") {
      buy("draught-mp", btn);
      return;
    }
    if (act === "deposit" || act === "withdraw") {
      const n = amountValue();
      const purse = Math.floor(Number(session.purse) || 0);
      const bank = Math.floor(Number(session.bank) || 0);
      if (n <= 0 || (act === "deposit" ? purse < n : bank < n)) {
        refuse(btn);
        return;
      }
      if (act === "deposit") {
        session.purse = purse - n;
        session.bank = Math.min(1e9, bank + n);
      } else {
        session.bank = bank - n;
        session.purse = Math.min(1e9, purse + n);
      }
      noteChange();
      render();
      return;
    }
    if (act === "equip") {
      equipFromPack(index, btn);
      return;
    }
    if (act === "unequip") {
      unequip(btn.getAttribute("data-slot"), btn);
      return;
    }
    if (act === "sell") {
      const item = session.pack[index];
      if (!isGear(item)) {
        refuse(btn);
        return;
      }
      const price = sellValue(item);
      session.pack.splice(index, 1);
      session.purse = Math.min(1e9, Math.floor(Number(session.purse) || 0) + price);
      buyback.push({ item, price });
      while (buyback.length > BUYBACK_CAP) buyback.shift();
      noteChange();
      render();
      return;
    }
    if (act === "stash") {
      const item = session.pack[index];
      if (!item || session.stash.length >= STASH_CAP) {
        refuse(btn);
        return;
      }
      session.pack.splice(index, 1);
      session.stash.push(item);
      noteChange();
      render();
      return;
    }
    if (act === "pack") {
      const item = session.stash[index];
      if (!item || session.pack.length >= PACK_CAP) {
        refuse(btn);
        return;
      }
      session.stash.splice(index, 1);
      session.pack.push(item);
      noteChange();
      render();
      return;
    }
    if (act === "buyback") {
      const entry = buyback[index];
      if (!entry || Math.floor(Number(session.purse) || 0) < entry.price || session.pack.length >= PACK_CAP) {
        refuse(btn);
        return;
      }
      session.purse = Math.floor(Number(session.purse) || 0) - entry.price;
      session.pack.push(entry.item);
      buyback.splice(index, 1);
      noteChange();
      render();
    }
  }

  function upgradeTarget(session, btn) {
    const slot = btn.getAttribute("data-slot");
    if (slot && session.equipped && session.equipped[slot]) return session.equipped[slot];
    if (!btn.hasAttribute("data-index") || !Array.isArray(session.pack)) return null;
    return session.pack[Number(btn.getAttribute("data-index"))] || null;
  }

  function openPanel(kind, station) {
    if (!PANEL_TITLES[kind]) {
      closePanel();
      return;
    }
    panelKind = kind;
    const home = (rt.stations || []).find((s) => s.panel === kind) || null;
    if (station && Number.isFinite(station.x)) {
      rt.panelStation = home && !station.keeperLine ? Object.assign({ keeperLine: home.keeperLine }, station) : station;
    } else {
      rt.panelStation = home || rt.panelStation;
    }
    rt.panelOpen = true;
    if (rt.resetTalk) rt.resetTalk(kind);
    panel.setAttribute("aria-label", PANEL_TITLES[kind]);
    placePanel();
    panel.hidden = false;
    panel.removeAttribute("aria-hidden");
    render();
  }

  function closePanel() {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    rt.panelOpen = false;
  }

  function clearBuyback() {
    buyback.length = 0;
  }

  function refreshGear() {
    if (rt.derivePools) rt.derivePools();
    if (rt.syncVitals) rt.syncVitals();
  }

  function equipFromPack(index, btn) {
    const session = rt.session;
    if (!session || !Array.isArray(session.pack) || !session.equipped) return;
    const item = session.pack[index];
    if (!isGear(item) || !item.slot || !Object.prototype.hasOwnProperty.call(session.equipped, item.slot)) {
      refuse(btn);
      return;
    }
    const prev = session.equipped[item.slot];
    session.equipped[item.slot] = item;
    if (prev) session.pack[index] = prev;
    else session.pack.splice(index, 1);
    refreshGear();
    noteChange();
    render();
  }

  function unequip(slot, btn) {
    const session = rt.session;
    if (!session || !session.equipped || !Object.prototype.hasOwnProperty.call(session.equipped, slot)) return;
    const item = session.equipped[slot];
    if (!item) {
      refuse(btn);
      return;
    }
    if (!Array.isArray(session.pack)) session.pack = [];
    if (session.pack.length >= PACK_CAP) {
      if (rt.say) rt.say("Your pack is full.");
      refuse(btn);
      return;
    }
    session.equipped[slot] = null;
    session.pack.push(item);
    refreshGear();
    noteChange();
    render();
  }

  function notePicked(uid) {
    const run = rt.session && rt.session.run;
    if (!run || typeof uid !== "string" || !uid) return;
    if (!Array.isArray(run.picked)) run.picked = [];
    if (run.picked.indexOf(uid) < 0) run.picked.push(uid);
  }

  function takeGear(drop) {
    const session = rt.session;
    session.pack.push(drop.item);
    notePicked(drop.uid);
    if (rt.releaseDropMesh) rt.releaseDropMesh(drop);
  }

  function useHealthDraught() {
    const session = rt.session;
    const vitals = rt.vitals;
    if (!session || !vitals || !Array.isArray(session.pack)) return { ok: false, reason: "empty" };
    let index = -1;
    for (let i = 0; i < session.pack.length; i++) {
      const item = session.pack[i];
      if (item && item.kind === "consumable" && item.consumableId === "draught-hp" && Math.floor(Number(item.stack) || 0) > 0) {
        index = i;
        break;
      }
    }
    if (index < 0) return { ok: false, reason: "empty" };
    if (vitals.hp >= vitals.hpMax) return { ok: false, reason: "full" };
    const item = session.pack[index];
    item.stack = Math.floor(Number(item.stack) || 0) - 1;
    if (item.stack <= 0) session.pack.splice(index, 1);
    vitals.hp = Math.min(vitals.hpMax, vitals.hp + DRAUGHT_HEAL);
    noteChange();
    if (!panel.hidden) render();
    return { ok: true };
  }

  function tryPickupGear() {
    const drops = rt.groundDrops;
    const session = rt.session;
    const player = rt.player;
    if (!drops || !session || !player) return false;
    if (!Array.isArray(session.pack)) session.pack = [];
    let best = -1;
    let bestD = 2.2 + 1e-4;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      if (!drop || drop.kind !== "gear" || !drop.item) continue;
      const dist = Math.hypot(player.position.x - drop.x, player.position.z - drop.z);
      if (dist <= bestD) {
        best = i;
        bestD = dist;
      }
    }
    if (best < 0) return false;
    const drop = drops[best];
    if (session.pack.length >= PACK_CAP) {
      if (rt.say) rt.say("Your pack is full.");
      drop.toldFull = true;
      return true;
    }
    takeGear(drop);
    drops.splice(best, 1);
    noteChange();
    if (!panel.hidden) render();
    return true;
  }

  function collectDrops() {
    const drops = rt.groundDrops;
    const session = rt.session;
    const player = rt.player;
    if (!drops || !session || !player) return;
    if (!Array.isArray(session.pack)) session.pack = [];
    let changed = false;
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      if (!drop) {
        drops.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(player.position.x - drop.x, player.position.z - drop.z);
      if (dist > 1.35 + 1e-4) continue;
      if (drop.kind === "gold") {
        const amount = Math.max(0, Math.floor(Number(drop.amount) || 0));
        session.purse = Math.min(1e9, Math.floor(Number(session.purse) || 0) + amount);
        drops.splice(i, 1);
        changed = true;
        continue;
      }
      if (drop.kind === "gear") {
        if (!drop.item) continue;
        if (session.pack.length >= PACK_CAP) {
          if (!drop.toldFull && rt.say) {
            rt.say("Your pack is full.");
            drop.toldFull = true;
          }
          continue;
        }
        takeGear(drop);
        drops.splice(i, 1);
        changed = true;
        continue;
      }
      if (drop.kind !== "draught") continue;
      const id = drop.consumableId === "draught-mp" ? "draught-mp" : "draught-hp";
      const want = Math.max(1, Math.floor(Number(drop.stack) || 1));
      const got = addDraught(session.pack, id, want, (cid, stack) => makeDraught(session, cid, stack));
      if (got <= 0) {
        if (!drop.toldFull && rt.say) {
          rt.say("Your pack is full.");
          drop.toldFull = true;
        }
        continue;
      }
      changed = true;
      if (got < want) {
        drop.stack = want - got;
        if (!drop.toldFull && rt.say) {
          rt.say("Your pack is full.");
          drop.toldFull = true;
        }
      } else {
        drops.splice(i, 1);
      }
    }
    if (changed) {
      noteChange();
      if (!panel.hidden) render();
    }
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("input", (e) => {
    if (e.target && e.target.id === "panel-amount") amountDraft = e.target.value;
  });
  window.addEventListener("resize", () => {
    if (!panel.hidden) placePanel();
  });

  rt.panelOpen = false;
  rt.panelStation = null;
  rt.openPanel = openPanel;
  rt.closePanel = closePanel;
  rt.clearBuyback = clearBuyback;
  rt.useHealthDraught = useHealthDraught;
  rt.collectDrops = collectDrops;
  rt.tryPickupGear = tryPickupGear;
  rt.listBuyback = function () {
    return buyback.map((entry) => ({ uid: entry.item && entry.item.uid, price: entry.price }));
  };
  rt.vendorValue = vendorValue;
  rt.sellValue = sellValue;
}
