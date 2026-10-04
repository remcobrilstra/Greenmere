// Bramble & Board, the Circle, the Quench, and the Still share #panel. Buyback stays in the session and is not saved.

import { raiseRank, upgradeCost } from "../sim/balance.js";
import { RECIPES, tryCraft, tryUpgrade } from "../sim/items.js";
import { affixLines, changeText, compareEquip, compareUpgrade, trackEffects, trackNext, upgradedCopy } from "../sim/gearstats.js";
import { el, num, glyph, itemCell, attachTips, gearTip, rarityOf, RARITY_EDGE, upgradeStatus } from "./gearui.js";

export const PACK_CAP = 24;
export const STASH_CAP = 48;
export const BUYBACK_CAP = 8;
export const DRAUGHT_PRICE = 25;
export const DRAUGHT_STACK = 20;
export const DRAUGHT_HEAL = 45;
const PANEL_TITLES = { store: "Bramble & Board", smith: "The Quench", trainer: "The Circle", still: "The Still", bank: "The Counting House", inn: "The Banked Fire", board: "Notice Board" };
const WORN_KEYS = ["weapon", "offhand", "head", "body", "feet", "trinket"];
const SLOT_LABEL = { weapon: "Weapon", offhand: "Offhand", head: "Head", body: "Body", feet: "Feet", trinket: "Trinket" };
const MAT_LABEL = { heartwood: "Heartwood", rootfiber: "Rootfiber", slag: "Slag", emberglass: "Emberglass" };

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
  ["edge", "Edge", "Your strike: damage, reach, and speed."],
  ["bulwark", "Bulwark", "Your ward: how much it soaks and how long it holds."],
  ["mend", "Mend", "Your heal: how much, how fast, and how cheap."],
  ["delver", "Delver", "Getting about: speed, the hearth home, and extra materials."]
];

// What a carried supply does, in one line.
const SUPPLY_TEXT = {
  "draught-hp": "Restores " + DRAUGHT_HEAL + " health. Drink it from the action bar.",
  "draught-mp": "Restores mana. Drink it from the action bar.",
  oil: "Coats the blade: the next strikes deal 15% more damage, one charge each.",
  kit: "Pays the materials for one upgrade at The Quench (gold is still due)."
};
const RECIPE_TEXT = {
  "draught-hp": "Each restores " + DRAUGHT_HEAL + " health.",
  oil: "10 strikes at +15% damage.",
  kit: "Stands in for the materials of one upgrade."
};
const MAT_NAMES = ["heartwood", "rootfiber", "slag", "emberglass"];

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

  const tips = attachTips(panel);
  const tabFor = { store: "trade", smith: "upgrade", bank: "gold", board: "notices" };
  const TABS = {
    store: [["trade", "Trade"], ["worn", "Worn"], ["buyback", "Buyback"]],
    smith: [["upgrade", "Upgrade"], ["craft", "Craft"]],
    bank: [["gold", "Gold"], ["stash", "Stash"]],
    board: [["notices", "Notices"], ["mine", "Your quests"]]
  };

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

  // A full-width line under a card's name.
  function detail(row, text, cls) {
    row.appendChild(el("span", "detail" + (cls ? " " + cls : ""), text));
  }

  // Stat changes as green and red pieces: "Strike damage +3 · Max health −12".
  function changeLine(row, prefix, changes) {
    const line = el("span", "detail");
    if (prefix) line.appendChild(el("span", "", prefix));
    changes.forEach((c, i) => {
      if (i) line.appendChild(el("span", "", "  ·  "));
      line.appendChild(el("span", c.good ? "up" : "down", changeText(c)));
    });
    row.appendChild(line);
  }

  function carried(id) {
    const pack = rt.session && Array.isArray(rt.session.pack) ? rt.session.pack : [];
    let n = 0;
    for (const it of pack) if (it && it.kind === "consumable" && it.consumableId === id) n += Math.max(1, Math.floor(Number(it.stack) || 1));
    return n;
  }

  // ---- building blocks ----

  // A card for one item: its cell (hover for the full tooltip), name, details, and controls.
  // Class "slot pack-row" and the 2 px rarity edge are kept for existing hooks.
  function ware(parent, item, key, opts) {
    const o = opts || {};
    const row = el("div", item || o.slot ? "slot pack-row ware" : "ware");
    const rarity = rarityOf(item);
    row.style.borderTop = "2px solid " + (item ? RARITY_EDGE[rarity] : "rgba(210, 165, 79, 0.25)");
    const cell = itemCell(item, { slot: o.slot, kind: o.kind, color: o.color, tip: key });
    row.appendChild(cell);
    const main = el("div", "ware-main");
    const head = el("div", "ware-head");
    const name = el("span", "name", o.label || itemLabel(item));
    if (item && isGear(item)) name.style.color = RARITY_EDGE[rarity];
    head.appendChild(name);
    main.appendChild(head);
    row.appendChild(main);
    const acts = el("div", "ware-acts");
    row.appendChild(acts);
    if (item || o.slot) {
      const note = o.note || (isGear(item) ? (rt.space === "dungeon" ? "Carried  ·  lost if you fall." : "") : "");
      tips.set(key, gearTip(rt.session, item, { slot: o.slot, worn: !!o.worn, note, supply: item && SUPPLY_TEXT[item.consumableId] }));
    }
    parent.appendChild(row);
    return { row, main, head, acts };
  }

  // What a carried piece is, and what wearing it would change.
  function gearDetails(card, item, opts) {
    const lines = affixLines(item);
    detail(card.main, (SLOT_LABEL[item.slot] || "Gear") + "  ·  ilvl " + Math.floor(Number(item.ilvl) || 0) + (lines.length ? "  ·  " + lines.join("  ·  ") : "  ·  no affixes"), "muted");
    if (!opts || !opts.compare) return;
    const cmp = compareEquip(rt.session, item);
    if (!cmp) return;
    const tag = { better: "▲ Better", worse: "▼ Worse", mixed: "◆ Trade-off", same: "= Same" }[cmp.verdict];
    card.head.appendChild(el("span", "verdict " + cmp.verdict, tag));
    const vs = "vs " + (cmp.worn ? itemLabel(cmp.worn) : "empty " + item.slot) + ": ";
    if (cmp.changes.length) changeLine(card.main, vs, cmp.changes);
    else detail(card.main, vs + "no change to your stats.", "muted");
  }

  function supplyDetails(card, item) {
    const text = item && SUPPLY_TEXT[item.consumableId];
    if (!text) return;
    const charges = item.consumableId === "oil" ? "  " + Math.floor(Number(item.charges) || 0) + " charges left." : "";
    detail(card.main, text + charges, "muted");
  }

  // Price chips: gold and each material, marked short when you lack it.
  function costChips(parent, cost, skipMats) {
    const s = rt.session || {};
    const mats = s.materials || {};
    const line = el("span", "detail costs");
    line.appendChild(el("span", "costs-label", "Costs"));
    const gold = Math.floor(Number(cost && cost.gold) || 0);
    const purse = Math.floor(Number(s.purse) || 0);
    const g = el("span", "chip" + (purse < gold ? " down" : ""));
    g.appendChild(glyph("gold"));
    g.appendChild(el("span", "", gold + " gold"));
    line.appendChild(g);
    const req = !skipMats && cost && cost.materials ? cost.materials : {};
    for (const k of Object.keys(req)) {
      const have = Math.floor(Number(mats[k]) || 0);
      const c = el("span", "chip" + (have < req[k] ? " down" : ""));
      c.appendChild(glyph(k));
      c.appendChild(el("span", "", req[k] + " " + k + " (have " + have + ")"));
      line.appendChild(c);
    }
    parent.appendChild(line);
  }

  // Wallet chips in the header: what this counter takes.
  function wallet(head, keys) {
    const s = rt.session || {};
    const box = el("div", "kp-wallet");
    for (const k of keys) {
      const chip = el("span", "chip");
      if (k === "points") {
        const pts = Math.floor(Number(s.skillPoints) || 0);
        chip.className = "chip" + (pts ? " lit" : "");
        chip.appendChild(el("span", "", "Unspent points " + pts));
        chip.title = "One point each level.";
      } else if (k === "purse" || k === "bank") {
        chip.appendChild(glyph("gold"));
        chip.appendChild(el("span", "", (k === "purse" ? "Purse " : "Bank ") + num(k === "purse" ? s.purse : s.bank)));
      } else if (k === "depth") {
        chip.appendChild(el("span", "", "Depth " + Math.floor(Number(s.bestDepth) || 0)));
        chip.title = "Deepest extract. Upgrades go up to this item level.";
      } else {
        const have = Math.floor(Number(s.materials && s.materials[k]) || 0);
        chip.appendChild(glyph(k));
        chip.appendChild(el("span", "", String(have)));
        chip.title = MAT_LABEL[k] + " " + have;
        chip.setAttribute("aria-label", MAT_LABEL[k] + " " + have);
      }
      box.appendChild(chip);
    }
    head.appendChild(box);
  }

  // Header, keeper column, counter column. Returns both columns.
  function frame(title, keys) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    tips.reset();
    const head = el("div", "kp-head");
    const id = el("div", "kp-title");
    id.appendChild(el("p", "eyebrow", title));
    const st = rt.panelStation;
    if (st && st.keeperLine) id.appendChild(el("p", "panel-line keeper", st.keeperLine));
    head.appendChild(id);
    wallet(head, keys);
    const close = button("close", "×");
    close.classList.add("kp-close");
    close.setAttribute("aria-label", "Close");
    head.appendChild(close);
    panel.appendChild(head);
    const body = el("div", "kp-body");
    const keeper = el("aside", "kp-keeper");
    const counter = el("div", "kp-counter");
    body.appendChild(keeper);
    body.appendChild(counter);
    panel.appendChild(body);
    return { keeper, counter };
  }

  // Keeper column: what they are saying, a control to hear more, their request.
  function keeperColumn(col, note) {
    const talk = rt.keeperTalk ? rt.keeperTalk(panelKind, false) : null;
    if (talk && talk.line) {
      const card = el("div", "kp-card talk");
      card.appendChild(el("p", "panel-talk", "“" + talk.line + "”"));
      card.appendChild(button("talk", talk.index + 1 < talk.count ? "Ask more" : "Start over"));
      col.appendChild(card);
    }
    requestBlock(col);
    if (note) col.appendChild(el("p", "panel-line muted kp-note", note));
  }

  // Tabs over the counter; every pane is built, only the chosen one shows.
  function tabbed(col, panes) {
    const list = TABS[panelKind];
    const want = tabFor[panelKind];
    const bar = el("div", "kp-tabs");
    bar.setAttribute("role", "tablist");
    for (const [id, label] of list) {
      const b = button("tab", label, { "data-tab": id, role: "tab", "aria-selected": id === want ? "true" : "false" });
      b.classList.add("kp-tab");
      if (id === want) b.classList.add("on");
      bar.appendChild(b);
    }
    col.appendChild(bar);
    const out = {};
    for (const [id] of list) {
      const pane = el("div", "kp-pane");
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("data-pane", id);
      pane.hidden = id !== want;
      col.appendChild(pane);
      out[id] = pane;
    }
    return out;
  }

  function section(parent, text) {
    parent.appendChild(el("p", "section-label", text));
  }
  function empty(parent, text) {
    parent.appendChild(el("p", "panel-empty", text));
  }

  function rewardLine(r) {
    const parts = [];
    if (r.gold) parts.push(r.gold + " gold");
    if (r.xp) parts.push(r.xp + " xp");
    for (const k of Object.keys(r.materials || {})) parts.push(r.materials[k] + " " + k);
    return "Reward: " + parts.join(", ");
  }

  function questRow(parent, qst, actions) {
    const row = el("div", "slot quest-row");
    const head = el("div", "quest-head");
    head.appendChild(glyph("quest"));
    head.appendChild(el("span", "name", qst.title));
    row.appendChild(head);
    row.appendChild(el("span", "affix", qst.text));
    const count = qst.objective.count;
    if (rt.questProgress && rt.findQuest && rt.findQuest(qst.key)) {
      const have = Math.min(count, rt.questProgress(qst));
      const prog = el("div", "quest-prog");
      const bar = el("div", "bar xp");
      const fill = el("span");
      fill.style.width = Math.round((have / Math.max(1, count)) * 100) + "%";
      bar.appendChild(fill);
      prog.appendChild(bar);
      prog.appendChild(el("span", "affix", "Progress " + rt.questProgress(qst) + " / " + count));
      row.appendChild(prog);
    }
    row.appendChild(el("span", "affix reward", rewardLine(qst.reward)));
    if (actions.length) {
      const acts = el("div", "quest-acts");
      for (const a of actions) acts.appendChild(a);
      row.appendChild(acts);
    }
    parent.appendChild(row);
  }

  // A keeper's request: offered, in progress, or ready to hand in.
  function requestBlock(col) {
    const req = rt.keeperRequest ? rt.keeperRequest(panelKind) : null;
    if (!req) return;
    section(col, "Request");
    const qst = req.quest;
    if (req.state === "offer") {
      questRow(col, qst, [button("quest-take", "Accept", { "data-key": qst.key, "data-source": "request" })]);
      return;
    }
    const done = rt.questComplete && rt.questComplete(qst);
    const label = qst.objective.type === "deliver" ? "Hand over" : "Hand in";
    questRow(col, qst, done ? [button("quest-claim", label, { "data-key": qst.key })] : []);
  }

  // ---- the counters ----

  // The notice board in the square: today's notices and the Warden's quests.
  function renderBoard() {
    const b = rt.questBoard ? rt.questBoard() : { offers: [], active: [], cap: 0 };
    const { keeper, counter } = frame("Notice Board", []);
    keeper.appendChild(el("p", "panel-line keeper", "New notices go up at dawn. Unfinished ones come down at midnight."));
    keeper.appendChild(el("p", "panel-line muted kp-note", "You can carry " + b.cap + " quests. Notices are claimed here; keepers' requests are handed in to the keeper who asked."));
    const panes = tabbed(counter);
    section(panes.notices, "Today's notices");
    const grid = el("div", "card-grid");
    panes.notices.appendChild(grid);
    if (!b.offers.length) empty(grid, "Nothing new today. Come back tomorrow.");
    for (const o of b.offers) questRow(grid, o, [button("quest-take", "Take", { "data-key": o.key, "data-source": "board" })]);
    section(panes.mine, "Your quests " + b.active.length + " / " + b.cap);
    const mine = el("div", "card-grid");
    panes.mine.appendChild(mine);
    if (!b.active.length) empty(mine, "You carry no quests.");
    for (const a of b.active) {
      const actions = [];
      const done = rt.questComplete && rt.questComplete(a);
      if (a.giver === "board" && done) actions.push(button("quest-claim", "Claim", { "data-key": a.key }));
      if (a.giver !== "board" && done) actions.push(el("span", "affix", "Hand in to the keeper who asked."));
      if (!done) actions.push(button("quest-drop", "Abandon", { "data-key": a.key }));
      questRow(mine, a, actions);
    }
  }

  function vitalBar(parent, cls, now, max, label) {
    const bar = el("div", "bar " + cls);
    const fill = el("span");
    fill.style.width = Math.round((now / Math.max(1, max)) * 100) + "%";
    bar.appendChild(fill);
    bar.appendChild(el("em", "", label + " " + Math.round(now) + " / " + max));
    parent.appendChild(bar);
  }

  function renderInn() {
    const { keeper, counter } = frame("The Banked Fire", ["purse"]);
    keeperColumn(keeper);
    const night = rt.townClock ? rt.townClock.phase : 0.5;
    const late = night < 0.24 || night >= 0.7;
    const v = rt.vitals;
    const hurt = v && (v.hp < v.hpMax || v.mp < v.mpMax);
    section(counter, "Rooms");
    const card = el("div", "kp-card feature");
    const top = el("div", "feature-top");
    top.appendChild(itemCell(null, { kind: "rest", color: "#f3d79a" }));
    const words = el("div", "feature-words");
    words.appendChild(el("p", "feature-title", late ? "A room until morning" : "A seat by the fire until evening"));
    words.appendChild(el("p", "panel-line", "Free of charge. Restores health and mana to full and passes the time " + (late ? "until morning" : "until evening") + "." + (hurt ? "" : " You are already rested.")));
    top.appendChild(words);
    card.appendChild(top);
    if (v) {
      const bars = el("div", "feature-bars");
      vitalBar(bars, "health", v.hp, v.hpMax, "Health");
      vitalBar(bars, "mana", v.mp, v.mpMax, "Mana");
      card.appendChild(bars);
    }
    const row = el("div", "row");
    row.appendChild(button("rest", late ? "Take a room until morning" : "Rest by the fire until evening"));
    card.appendChild(row);
    counter.appendChild(card);
  }

  // The Counting House: gold between purse and bank, gear between pack and stash.
  function renderBank() {
    const session = rt.session;
    const pack = session && Array.isArray(session.pack) ? session.pack : [];
    const stash = session && Array.isArray(session.stash) ? session.stash : [];
    const purse = session ? Math.floor(Number(session.purse) || 0) : 0;
    const bank = session ? Math.floor(Number(session.bank) || 0) : 0;
    const { keeper, counter } = frame("The Counting House", ["purse", "bank"]);
    keeperColumn(keeper, "Banked gold and stashed gear are safe if you fall below. Your purse and pack are not.");
    const panes = tabbed(counter);

    const vaults = el("div", "vaults");
    for (const [label, value, note, risk] of [["Purse", purse, "Carried. Lost if you fall.", true], ["Bank", bank, "Kept here. Never lost.", false]]) {
      const v = el("div", "kp-card vault" + (risk ? " risk" : ""));
      v.appendChild(el("p", "section-label", label));
      const big = el("p", "vault-sum");
      big.appendChild(glyph("gold"));
      big.appendChild(el("span", "", num(value)));
      v.appendChild(big);
      v.appendChild(el("p", "panel-line muted", note));
      vaults.appendChild(v);
    }
    panes.gold.appendChild(vaults);
    const move = el("div", "kp-card");
    move.appendChild(el("p", "section-label", "Move gold"));
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
    move.appendChild(bankRow);
    const allRow = el("div", "row");
    allRow.appendChild(button("deposit-all", "Deposit all · " + purse));
    allRow.appendChild(button("withdraw-all", "Withdraw all · " + bank));
    move.appendChild(allRow);
    panes.gold.appendChild(move);

    const cols = el("div", "two-col");
    const packCol = el("div", "col");
    const stashCol = el("div", "col");
    section(packCol, "Pack " + pack.length + " / " + PACK_CAP);
    if (!pack.length) empty(packCol, "The pack is empty.");
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      const card = ware(packCol, item, "pack:" + i);
      if (isGear(item)) gearDetails(card, item, { compare: true });
      else supplyDetails(card, item);
      card.acts.appendChild(button("stash", "Stash", { "data-index": String(i) }));
    }
    section(stashCol, "Stash " + stash.length + " / " + STASH_CAP);
    if (!stash.length) empty(stashCol, "The stash is empty.");
    for (let i = 0; i < stash.length; i++) {
      const item = stash[i];
      const card = ware(stashCol, item, "stash:" + i, { note: "In the stash  ·  always kept." });
      if (isGear(item)) gearDetails(card, item, { compare: true });
      else supplyDetails(card, item);
      card.acts.appendChild(button("pack", "To pack", { "data-index": String(i) }));
    }
    cols.appendChild(packCol);
    cols.appendChild(stashCol);
    panes.stash.appendChild(cols);
  }

  function recipeCards(parent, station) {
    const grid = el("div", "card-grid");
    for (let i = 0; i < RECIPES.length; i++) {
      const recipe = RECIPES[i];
      if ((recipe.station || "smith") !== station) continue;
      const gets = recipe.stack ? recipe.count + " " + recipe.name : recipe.name;
      const kind = recipe.consumableId === "oil" ? "oil" : recipe.consumableId === "kit" ? "kit" : "draught";
      const color = recipe.consumableId === "draught-mp" ? "#6f9bf0" : kind === "draught" ? "#e2665a" : "#f3d79a";
      const card = ware(grid, null, "recipe:" + recipe.id, { label: gets, kind: recipe.consumableId || kind, color });
      card.row.classList.add("recipe");
      const have = carried(recipe.consumableId);
      if (RECIPE_TEXT[recipe.id]) detail(card.main, RECIPE_TEXT[recipe.id] + (have ? "  You carry " + have + "." : ""), "muted");
      costChips(card.main, recipe);
      card.acts.appendChild(button("craft", station === "still" ? "Distill" : "Craft", { "data-recipe": recipe.id }));
    }
    parent.appendChild(grid);
  }

  function renderStill() {
    const { keeper, counter } = frame("The Still", ["purse"].concat(MAT_NAMES));
    keeperColumn(keeper);
    section(counter, "Distillations");
    recipeCards(counter, "still");
  }

  function renderTrainer() {
    const session = rt.session;
    const tracks = session && session.tracks ? session.tracks : {};
    const points = session ? Math.floor(Number(session.skillPoints) || 0) : 0;
    const { keeper, counter } = frame("The Circle", ["points"]);
    keeperColumn(keeper, points ? "" : "You earn one point each level.");
    section(counter, "Training");
    const grid = el("div", "track-grid");
    for (let i = 0; i < TRAINER_ROWS.length; i++) {
      const key = TRAINER_ROWS[i][0];
      const label = TRAINER_ROWS[i][1];
      const rank = Math.max(0, Math.min(5, Math.floor(Number(tracks[key]) || 0)));
      const card = el("div", "kp-card track");
      const top = el("div", "track-top");
      top.appendChild(itemCell(null, { kind: key, color: "#f3d79a" }));
      const words = el("div", "track-words");
      words.appendChild(el("span", "name", label));
      const pips = el("span", "pips");
      for (let p = 0; p < 5; p++) pips.appendChild(el("i", p < rank ? "on" : ""));
      pips.appendChild(el("span", "rank", rank + " / 5"));
      words.appendChild(pips);
      top.appendChild(words);
      card.appendChild(top);
      detail(card, TRAINER_ROWS[i][2], "muted");
      if (rank >= 5) {
        detail(card, "Mastered: " + trackEffects(key, rank).filter((e) => e[1] !== "—").map((e) => e[0] + " " + e[1]).join("  ·  "));
      } else {
        const next = trackNext(key, rank);
        const list = el("div", "track-next");
        list.appendChild(el("span", "detail", "Rank " + (rank + 1) + ":"));
        for (const n of next) list.appendChild(el("span", "up", n[0] + " " + (n[1] === "—" ? n[2] : n[1] + " → " + n[2])));
        card.appendChild(list);
      }
      const row = el("div", "row");
      row.appendChild(button("raise", "Raise", { "data-track": key }));
      card.appendChild(row);
      grid.appendChild(card);
    }
    counter.appendChild(grid);
  }

  function renderSmith() {
    const session = rt.session;
    const pack = session && Array.isArray(session.pack) ? session.pack : [];
    const { keeper, counter } = frame("The Quench", ["purse", "depth"].concat(MAT_NAMES));
    keeperColumn(keeper, "Each upgrade adds one item level, up to the deepest floor you have extracted from.");
    const panes = tabbed(counter);
    let kit = false;
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      if (item && item.kind === "consumable" && item.consumableId === "kit") kit = true;
    }
    const equipped = session && session.equipped;
    let gearRows = 0;
    section(panes.upgrade, "Worn");
    for (const key of WORN_KEYS) {
      const item = equipped ? equipped[key] : null;
      if (!item || item.kind === "consumable") continue;
      gearRows += 1;
      upgradeCard(panes.upgrade, item, { "data-slot": key }, kit, key, "eq:" + key);
    }
    const carriedGear = pack.map((item, i) => [item, i]).filter(([item]) => item && item.kind !== "consumable");
    if (carriedGear.length) section(panes.upgrade, "Carried");
    for (const [item, i] of carriedGear) {
      gearRows += 1;
      upgradeCard(panes.upgrade, item, { "data-index": String(i) }, kit, null, "pack:" + i);
    }
    if (!gearRows) empty(panes.upgrade, "No gear to quench.");
    section(panes.craft, "Recipes");
    recipeCards(panes.craft, "smith");
  }

  // One piece at the smith: what +1 item level does for you, what it costs,
  // and why it cannot be done yet.
  function upgradeCard(parent, item, attrs, kit, worn, key) {
    const ilvl = Math.max(0, Math.floor(Number(item.ilvl) || 0));
    const themeId = Math.max(0, Math.floor(Number(item.themeId) || 0));
    const card = ware(parent, item, key, { worn: !!worn, label: itemLabel(item) });
    card.head.appendChild(el("span", "ilvl-step", "ilvl " + ilvl + " → " + (ilvl + 1)));
    if (worn) detail(card.main, "Worn · " + worn, "muted");
    const up = compareUpgrade(rt.session, item);
    if (up && up.hollow) {
      detail(card.main, "No affixes: levelling it changes none of your stats.", "down");
    } else if (up && up.changes.length) {
      changeLine(card.main, worn ? "You gain: " : "If worn: ", up.changes);
    } else {
      detail(card.main, "Too small to show this level; affixes grow slowly with item level.", "muted");
    }
    detail(card.main, "Sells for " + sellValue(item) + " → " + sellValue(upgradedCopy(item)) + " gold", "muted");
    costChips(card.main, upgradeCost(ilvl, themeId));
    const status = upgradeStatus(rt.session || {}, item);
    if (status && !status.ok) detail(card.main, status.text, "down");
    card.acts.appendChild(button("upgrade", "Upgrade", attrs));
    if (kit) card.acts.appendChild(button("upgrade-kit", "Use kit", attrs));
  }

  function goodsCard(parent, id, name, text) {
    const item = { kind: "consumable", consumableId: id, name };
    const card = ware(parent, null, "goods:" + id, { label: name, kind: id, color: id === "draught-mp" ? "#6f9bf0" : "#e2665a" });
    card.row.classList.add("goods");
    tips.set("goods:" + id, gearTip(rt.session, item, { supply: text }));
    detail(card.main, text + " You carry " + carried(id) + ".", "muted");
    card.acts.appendChild(button(id === "draught-mp" ? "buy-mp" : "buy-hp", "Buy · " + DRAUGHT_PRICE + " gold"));
  }

  function render() {
    if (panelKind === "trainer") return renderTrainer();
    if (panelKind === "smith") return renderSmith();
    if (panelKind === "still") return renderStill();
    if (panelKind === "bank") return renderBank();
    if (panelKind === "inn") return renderInn();
    if (panelKind === "board") return renderBoard();
    const session = rt.session;
    const pack = session && Array.isArray(session.pack) ? session.pack : [];
    const purse = session ? Math.floor(Number(session.purse) || 0) : 0;
    const { keeper, counter } = frame("Bramble & Board", ["purse"]);
    keeperColumn(keeper, "Sold gear can be bought back for the same price until you leave town.");
    const panes = tabbed(counter);

    section(panes.trade, "For sale");
    const goods = el("div", "card-grid");
    goodsCard(goods, "draught-hp", "Health Draught", "Restores " + DRAUGHT_HEAL + " health.");
    goodsCard(goods, "draught-mp", "Mana Draught", "Restores mana.");
    panes.trade.appendChild(goods);

    section(panes.trade, "Pack " + pack.length + " / " + PACK_CAP);
    if (!pack.length) empty(panes.trade, "The pack is empty.");
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      const card = ware(panes.trade, item, "pack:" + i);
      if (isGear(item)) gearDetails(card, item, { compare: true });
      else supplyDetails(card, item);
      if (isGear(item) && item.slot) card.acts.appendChild(button("equip", "Equip", { "data-index": String(i) }));
      if (isGear(item)) {
        const price = sellValue(item);
        card.acts.appendChild(button("sell", "Sell · " + price + " gold", { "data-index": String(i), title: "Purse " + purse + " → " + (purse + price) + ". Buy it back for the same price later this session." }));
      }
    }

    const equipped = session && session.equipped;
    section(panes.worn, "Worn");
    for (const key of WORN_KEYS) {
      const item = equipped ? equipped[key] : null;
      const card = ware(panes.worn, item, "eq:" + key, { slot: key, worn: true, label: (SLOT_LABEL[key] + " · " + (item ? itemLabel(item) : "Empty")).slice(0, 80), note: "Worn  ·  always kept." });
      if (item) gearDetails(card, item);
      if (item) card.acts.appendChild(button("unequip", "Unequip", { "data-slot": key }));
    }

    section(panes.buyback, "Buyback " + buyback.length + " / " + BUYBACK_CAP);
    if (!buyback.length) empty(panes.buyback, "No recent sales.");
    for (let i = buyback.length - 1; i >= 0; i--) {
      const entry = buyback[i];
      const card = ware(panes.buyback, entry.item, "buyback:" + i);
      if (isGear(entry.item)) gearDetails(card, entry.item);
      card.acts.appendChild(button("buyback", "Buy back · " + entry.price, { "data-index": String(i) }));
    }
  }

  // Re-render, keeping the counter's scroll and an open tooltip.
  function renderKeep() {
    const scroller = panel.querySelector(".kp-counter");
    const top = scroller ? scroller.scrollTop : 0;
    render();
    const again = panel.querySelector(".kp-counter");
    if (again) again.scrollTop = top;
    tips.reanchor();
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
    renderKeep();
  }

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn || !panel.contains(btn)) return;
    const session = rt.session;
    if (!session) return;
    if (!Array.isArray(session.pack)) session.pack = [];
    if (!Array.isArray(session.stash)) session.stash = [];
    let act = btn.getAttribute("data-act");
    const index = btn.hasAttribute("data-index") ? Number(btn.getAttribute("data-index")) : -1;
    if (act === "close") {
      closePanel();
      return;
    }
    if (act === "tab") {
      tabFor[panelKind] = btn.getAttribute("data-tab");
      tips.hide();
      renderKeep();
      return;
    }
    if (act === "talk") {
      if (rt.keeperTalk) rt.keeperTalk(panelKind, true);
      renderKeep();
      return;
    }
    if (act === "quest-take") {
      const key = btn.getAttribute("data-key");
      let offer = null;
      if (btn.getAttribute("data-source") === "board") {
        const b = rt.questBoard ? rt.questBoard() : null;
        offer = b ? b.offers.find((o) => o.key === key) : null;
      } else {
        const req = rt.keeperRequest ? rt.keeperRequest(panelKind) : null;
        offer = req && req.state === "offer" && req.quest.key === key ? req.quest : null;
      }
      const res = offer && rt.takeQuest ? rt.takeQuest(offer) : { ok: false };
      if (!res.ok) {
        if (res.reason === "full" && rt.say) rt.say("You can carry six quests at most.");
        refuse(btn);
        return;
      }
      renderKeep();
      return;
    }
    if (act === "quest-claim") {
      const res = rt.claimQuest ? rt.claimQuest(btn.getAttribute("data-key")) : { ok: false };
      if (!res.ok) {
        refuse(btn);
        return;
      }
      renderKeep();
      return;
    }
    if (act === "quest-drop") {
      if (rt.abandonQuest) rt.abandonQuest(btn.getAttribute("data-key"));
      renderKeep();
      return;
    }
    if (act === "rest") {
      if (rt.restAtInn) rt.restAtInn();
      renderKeep();
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
      renderKeep();
      return;
    }
    if (act === "craft") {
      const crafted = tryCraft(session, btn.getAttribute("data-recipe"));
      if (!crafted.ok) {
        if (crafted.reason === "pack" && rt.say) rt.say("Your pack is full.");
        refuse(btn);
        return;
      }
      if (rt.questEvent) rt.questEvent({ type: "craft", recipe: btn.getAttribute("data-recipe") });
      noteChange();
      renderKeep();
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
      renderKeep();
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
    if (act === "deposit" || act === "withdraw" || act === "deposit-all" || act === "withdraw-all") {
      const purse = Math.floor(Number(session.purse) || 0);
      const bank = Math.floor(Number(session.bank) || 0);
      const n = act === "deposit-all" ? purse : act === "withdraw-all" ? bank : amountValue();
      if (act === "deposit-all") act = "deposit";
      else if (act === "withdraw-all") act = "withdraw";
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
      if (rt.questEvent) rt.questEvent({ type: act, amount: n });
      noteChange();
      renderKeep();
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
      if (rt.questEvent) rt.questEvent({ type: "sell" });
      noteChange();
      renderKeep();
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
      renderKeep();
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
      renderKeep();
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
      if (rt.questEvent) rt.questEvent({ type: "unsell" });
      noteChange();
      renderKeep();
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
    if (rt.sheetOpen && rt.closeSheet) rt.closeSheet();
    document.body.classList.add("window-open");
    if (rt.resetTalk) rt.resetTalk(kind);
    panel.setAttribute("aria-label", PANEL_TITLES[kind]);
    tips.hide();
    panel.hidden = false;
    panel.removeAttribute("aria-hidden");
    render();
  }

  function closePanel() {
    tips.hide();
    if (!rt.sheetOpen) document.body.classList.remove("window-open");
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
    renderKeep();
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
    renderKeep();
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
    if (!panel.hidden) renderKeep();
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
      if (!drop || drop.kind !== "gear" || !drop.item || drop.fly) continue;
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
    if (!panel.hidden) renderKeep();
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
      if (drop.fly) continue;
      const dist = Math.hypot(player.position.x - drop.x, player.position.z - drop.z);
      if (dist > 1.35 + 1e-4) continue;
      if (drop.kind === "gold") {
        const amount = Math.max(0, Math.floor(Number(drop.amount) || 0));
        session.purse = Math.min(1e9, Math.floor(Number(session.purse) || 0) + amount);
        if (drop.uid) notePicked(drop.uid);
        if (rt.releaseDropMesh) rt.releaseDropMesh(drop);
        drops.splice(i, 1);
        changed = true;
        if (rt.questEvent) rt.questEvent({ type: "gold", amount });
        continue;
      }
      if (drop.kind === "material") {
        if (!session.materials) session.materials = { heartwood: 0, rootfiber: 0, slag: 0, emberglass: 0 };
        const added = addMaterial(session.materials, drop.material, Math.max(1, Math.floor(Number(drop.amount) || 1)));
        if (drop.uid) notePicked(drop.uid);
        if (rt.releaseDropMesh) rt.releaseDropMesh(drop);
        drops.splice(i, 1);
        changed = true;
        if (added > 0 && rt.questEvent) rt.questEvent({ type: "material", material: drop.material, amount: added });
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
        if (rt.questEvent) rt.questEvent({ type: "gear", rarity: drop.item.rarity });
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
      if (!panel.hidden) renderKeep();
    }
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("input", (e) => {
    if (e.target && e.target.id === "panel-amount") amountDraft = e.target.value;
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
