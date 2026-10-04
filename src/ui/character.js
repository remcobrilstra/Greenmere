// What the Warden is carrying and how far along they are:
// - an experience bar in the vitals plaque (level, xp to next, unspent points);
// - a character sheet (I or C, or click the portrait) in three tabs:
//   Character: the paper doll with the six worn slots around it and the hero's
//     attributes, combat numbers, training, and wealth beside it;
//   Pack: the carried items as a grid, the stash count, the loot rules;
//   Ledger: the lifetime tally (time played, depth, kills, spoils) from sim/lifestats.js.
//   Hovering (or focusing) a slot, an item, or a stat shows a tooltip with its details;
//   carried gear is compared against what is worn.
// - a cast line on level-up.
// DOM only, built with textContent. Reads the session; changes nothing.

import { xpToNext } from "../sim/balance.js";
import { heroStats, compareEquip } from "../sim/gearstats.js";
import { gearTotals } from "../sim/items.js";
import { playTimeText } from "../sim/lifestats.js";
import { SLOT_NAME, RARITY_NAME, RARITY_EDGE, el, int, num, itemName, itemCell as gearCell, attachTips, gearTip, upgradeStatus } from "./gearui.js";

export { upgradeStatus };

const DOLL_LEFT = ["head", "body", "feet"];
const DOLL_RIGHT = ["trinket", "weapon", "offhand"];
const MATS = [["heartwood", "Heartwood"], ["rootfiber", "Rootfiber"], ["slag", "Slag"], ["emberglass", "Emberglass"]];
const TRACKS = [
  ["edge", "Edge", "Strike damage, reach, arc, and cooldown."],
  ["bulwark", "Bulwark", "Ward strength, cost, and duration."],
  ["mend", "Mend", "Mend healing, cost, and cast time."],
  ["delver", "Delver", "Walk and sprint speed, a faster hearth, extra materials."]
];
const PACK_CAP = 24;
const TABS = [["character", "Character"], ["pack", "Pack"], ["ledger", "Ledger"]];
const FOE_NAME = { skirmisher: "Skirmishers", brute: "Brutes", spitter: "Spitters", shade: "Shades", boss: "Floor guardians" };

export function attachCharacter(rt) {
  const hud = document.getElementById("hud") || document.body;

  // ---- experience bar under health and mana ----
  const bars = document.querySelector("#vitals .bars");
  const xpBar = el("div", "bar xp");
  xpBar.id = "xp-bar";
  xpBar.setAttribute("role", "meter");
  xpBar.setAttribute("aria-label", "Experience");
  const xpFill = el("span");
  const xpLabel = el("em");
  xpBar.appendChild(xpFill);
  xpBar.appendChild(xpLabel);
  if (bars) bars.appendChild(xpBar);

  // ---- the sheet and its tooltip ----
  const sheet = el("section", "plaque");
  sheet.id = "sheet";
  sheet.hidden = true;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Character");
  hud.appendChild(sheet);
  rt.sheetOpen = false;
  rt.sheetTab = "character";
  const tips = attachTips(sheet);

  function itemCell(s, it, key, slot, worn) {
    const cell = gearCell(it, { tag: "button", slot, tip: key });
    cell.setAttribute("aria-label", (slot ? SLOT_NAME[slot] + ": " : "") + itemName(it));
    const note = worn ? "Worn  ·  always kept." : (rt.space === "dungeon" ? "Carried  ·  lost if you fall." : "Carried  ·  equip it at a keeper's counter.");
    const supply = it && it.consumableId === "draught-mp" ? "Restores mana. Drink it from the action bar." : "Restores health. Drink it from the action bar.";
    tips.set(key, gearTip(s, it, { slot: slot || (it && it.slot), worn, note, supply }));
    return cell;
  }

  // ---- stat rows ----
  function statRow(parent, label, value, key, text, cls) {
    const row = el("div", "stat-row" + (cls ? " " + cls : ""));
    row.appendChild(el("span", "k", label));
    row.appendChild(el("span", "v", value));
    if (key) {
      row.setAttribute("data-tip", key);
      row.tabIndex = 0;
      tips.set(key, (t) => {
        t.title(label);
        for (const line of [].concat(text)) t.line(line, "muted");
      });
    }
    parent.appendChild(row);
    return row;
  }
  function group(parent, label) {
    const g = el("div", "stat-group");
    g.appendChild(el("p", "section-label", label));
    parent.appendChild(g);
    return g;
  }

  // ---- tabs ----
  function renderCharacter(s, body) {
    const below = rt.space === "dungeon";
    const eq = s.equipped || {};
    const wrap = el("div", "char-tab");

    // Left: the doll with slots around it, wealth strip below.
    const stage = el("div", "doll-stage");
    const left = el("div", "doll-col");
    const right = el("div", "doll-col");
    for (const [col, keys] of [[left, DOLL_LEFT], [right, DOLL_RIGHT]]) {
      for (const k of keys) {
        const it = eq[k] || null;
        const box = el("div", "doll-slot");
        box.appendChild(itemCell(s, it, "eq:" + k, k, true));
        box.appendChild(el("span", "slot-cap", SLOT_NAME[k]));
        col.appendChild(box);
      }
    }
    const frame = el("div", "doll-frame");
    if (rt.dollNode) frame.appendChild(rt.dollNode);
    stage.appendChild(left);
    stage.appendChild(frame);
    stage.appendChild(right);
    const leftSide = el("div", "char-left");
    leftSide.appendChild(stage);

    const wealth = group(leftSide, "Wealth");
    const coin = el("div", "stat-pair");
    statRow(coin, "Purse", num(s.purse), "w:purse", below ? "Carried gold. Lost if you fall below ground." : "Carried gold. Pays for upgrades and goods.", below ? "risk" : "gold");
    statRow(coin, "Bank", num(s.bank), "w:bank", "Safe at the Counting House. Never lost.");
    wealth.appendChild(coin);
    const mats = el("div", "stat-pair");
    for (const [k, name] of MATS) statRow(mats, name, num(s.materials && s.materials[k]), "m:" + k, ["Smithing material. Always kept, even if you fall.", "Orrin and Sister Wen ask for it."]);
    wealth.appendChild(mats);

    // Right: attributes and derived numbers.
    const side = el("div", "char-right");
    const level = Math.max(1, int(s.level));
    const need = xpToNext(level);
    const lv = group(side, "Level " + level);
    const xp = el("div", "bar xp sheet-xp");
    const fill = el("span");
    fill.style.width = Math.max(0, Math.min(100, (int(s.xp) / Math.max(1, need)) * 100)).toFixed(1) + "%";
    xp.appendChild(fill);
    xp.appendChild(el("em", "", int(s.xp) + " / " + need + " xp to level " + (level + 1)));
    lv.appendChild(xp);
    const pts = int(s.skillPoints);
    lv.appendChild(el("p", "sheet-line" + (pts ? " gold" : " muted"), pts ? pts + " skill point" + (pts > 1 ? "s" : "") + " to spend with Old Tamsin at The Circle." : "No skill points to spend."));
    lv.appendChild(el("p", "sheet-line muted", "Deepest extract: floor " + int(s.bestDepth) + "."));

    const st = heroStats(s, eq);
    const gear = gearTotals(eq);
    const base = 9 + level;
    const attrs = group(side, "Attributes");
    const R = Math.round;
    const plus = (v) => (R(v) ? "  (+" + R(v) + ")" : "");
    statRow(attrs, "Might", R(st.might) + plus(gear.might), "a:might", ["Base " + base + " from level, +" + R(gear.might) + " from gear.", "Each point: +8 max health and harder strikes."]);
    statRow(attrs, "Guard", R(st.guard) + plus(gear.guard), "a:guard", ["Base " + base + " from level, +" + R(gear.guard) + " from gear.", "Each point: +4 max health, less damage taken, a stronger ward."]);
    statRow(attrs, "Focus", R(st.focus) + plus(gear.focus), "a:focus", ["Base " + base + " from level, +" + R(gear.focus) + " from gear.", "Each point: +6 max mana."]);

    const v = rt.vitals || {};
    const combat = group(side, "Combat");
    statRow(combat, "Health", (v.hpMax ? Math.ceil(v.hp) + " / " : "") + R(st.hp), "c:hp", ["40 + 8 per Might + 4 per Guard" + (gear.flatHp ? " + " + R(gear.flatHp) + " from gear" : "") + "."]);
    statRow(combat, "Mana", (v.mpMax ? Math.floor(v.mp) + " / " : "") + R(st.mp), "c:mp", ["20 + 6 per Focus" + (gear.flatMp ? " + " + R(gear.flatMp) + " from gear" : "") + "."]);
    statRow(combat, "Strike damage", String(R(st.damage)), "c:dmg", ["From level, Might, the weapon's base damage, Keen, and Edge training."]);
    statRow(combat, "Damage taken", "−" + st.reduce + "%", "c:reduce", ["Guard ÷ (Guard + 50). More Guard, less damage from every hit."]);
    statRow(combat, "Ward absorbs", String(R(st.ward)), "c:ward", ["Damage one ward soaks up. Grows with Guard, Bulwark, and Woven gear."]);
    statRow(combat, "Move speed", (st.speed ? "+" + st.speed : "+0") + "%", "c:speed", ["Bonus from Quick boots. Delver training raises the base speed."]);

    const train = group(side, "Training");
    const tracks = s.tracks || {};
    for (const [k, name, what] of TRACKS) {
      const r = Math.max(0, Math.min(5, int(tracks[k])));
      const row = statRow(train, name, "", "t:" + k, [what, "Rank " + r + " of 5. Old Tamsin trains it at The Circle."]);
      const pips = row.querySelector(".v");
      pips.className = "v pips";
      for (let i = 0; i < 5; i++) pips.appendChild(el("i", i < r ? "on" : ""));
      pips.setAttribute("aria-label", r + " of 5");
    }

    wrap.appendChild(leftSide);
    wrap.appendChild(side);
    body.appendChild(wrap);
  }

  function renderPack(s, body) {
    const below = rt.space === "dungeon";
    const pack = Array.isArray(s.pack) ? s.pack : [];
    body.appendChild(el("p", "section-label", "Pack " + pack.length + " / " + PACK_CAP + (below ? "  ·  lost if you fall" : "")));
    const grid = el("div", "pack-grid");
    for (let i = 0; i < PACK_CAP; i++) {
      const it = pack[i] || null;
      const cell = itemCell(s, it, "pack:" + i, null, false);
      if (it) {
        const cmp = it.kind !== "consumable" ? compareEquip(s, it) : null;
        if (cmp && cmp.verdict === "better") cell.appendChild(el("span", "up-mark", "▲"));
        cell.appendChild(el("span", "sr", itemName(it) + (it.kind !== "consumable" ? " ilvl " + int(it.ilvl) : "")));
      } else {
        cell.removeAttribute("data-tip");
        cell.disabled = true;
      }
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    const stash = Array.isArray(s.stash) ? s.stash.length : 0;
    body.appendChild(el("p", "sheet-line muted", "▲ would raise your numbers if worn.  ·  Stash " + stash + " / 48, safe at the Counting House."));
    body.appendChild(el("p", "section-label", "How loot works"));
    body.appendChild(el("p", "sheet-line", "Gold, materials, and gear drop where foes fall. Walk over them to pick them up; gear needs room in the pack."));
    body.appendChild(el("p", "sheet-line", "Hold 4 below ground, standing still, to extract: everything you carry comes home."));
    body.appendChild(el("p", "sheet-line", "Fall in the Underwood and you lose your pack and purse. Worn gear, materials, the bank, and the stash are always kept."));
  }

  let timeNode = null;
  let delveTimeNode = null;
  function tile(parent, value, label, cls) {
    const t = el("div", "tile" + (cls ? " " + cls : ""));
    const v = el("span", "tv", value);
    t.appendChild(v);
    t.appendChild(el("span", "tl", label));
    parent.appendChild(t);
    return v;
  }
  function renderLedger(s, body) {
    const L = s.stats || {};
    const killsBy = L.killsBy || {};
    const byRarity = Array.isArray(L.gearByRarity) ? L.gearByRarity : [0, 0, 0, 0];

    body.appendChild(el("p", "section-label", "Time"));
    let tiles = el("div", "tiles");
    timeNode = tile(tiles, playTimeText(L.playSeconds), "Time played");
    delveTimeNode = tile(tiles, playTimeText(L.delveSeconds), "Below ground");
    tile(tiles, num(L.delves), "Delves started");
    tile(tiles, L.delves ? playTimeText(int(L.delveSeconds) / int(L.delves)) : "—", "Average delve");
    body.appendChild(tiles);

    body.appendChild(el("p", "section-label", "The Underwood"));
    tiles = el("div", "tiles");
    tile(tiles, num(L.deepestFloor), "Deepest floor reached", "gold");
    tile(tiles, num(s.bestDepth), "Deepest extract");
    tile(tiles, num(L.extracts), "Extracts home");
    tile(tiles, num(L.deaths), "Falls", L.deaths ? "risk" : "");
    body.appendChild(tiles);

    body.appendChild(el("p", "section-label", "Foes"));
    tiles = el("div", "tiles");
    tile(tiles, num(L.kills), "Foes slain", "gold");
    tile(tiles, num(L.elites), "Elites");
    tile(tiles, num(L.bosses), "Floor guardians");
    tile(tiles, L.deaths ? (int(L.kills) / int(L.deaths)).toFixed(1) : "—", "Kills per fall");
    body.appendChild(tiles);
    const kinds = el("div", "stat-pair");
    for (const k of ["skirmisher", "brute", "spitter", "shade"]) statRow(kinds, FOE_NAME[k], num(killsBy[k]));
    body.appendChild(kinds);

    body.appendChild(el("p", "section-label", "Spoils"));
    tiles = el("div", "tiles");
    tile(tiles, num(L.goldFound), "Gold found", "gold");
    tile(tiles, num(L.materialsFound), "Materials gathered");
    tile(tiles, num(L.gearFound), "Gear found");
    tile(tiles, num(L.chests), "Chests opened");
    body.appendChild(tiles);
    const rar = el("div", "stat-pair");
    for (let i = 0; i < 4; i++) statRow(rar, RARITY_NAME[i], num(byRarity[i])).querySelector(".k").style.color = RARITY_EDGE[i];
    body.appendChild(rar);

    body.appendChild(el("p", "section-label", "Greenmere"));
    tiles = el("div", "tiles");
    tile(tiles, num(L.questsDone), "Quests completed");
    tile(tiles, num(L.crafts), "Items crafted");
    tile(tiles, num(L.sold), "Items sold");
    tile(tiles, String(Math.max(1, int(s.level))), "Level");
    body.appendChild(tiles);
  }

  function render() {
    const s = rt.session || {};
    tips.reset();
    timeNode = null;
    delveTimeNode = null;
    const keepScroll = sheet.querySelector(".sheet-body");
    const scrollTop = keepScroll ? keepScroll.scrollTop : 0;
    while (sheet.firstChild) sheet.removeChild(sheet.firstChild);

    const head = el("div", "sheet-head");
    const title = el("div", "sheet-title");
    title.appendChild(el("p", "eyebrow", "Character"));
    title.appendChild(el("p", "sheet-name", (s.name || "Warden") + "  ·  Level " + Math.max(1, int(s.level))));
    head.appendChild(title);
    const tabs = el("div", "sheet-tabs");
    tabs.setAttribute("role", "tablist");
    for (const [id, label] of TABS) {
      const b = el("button", "slot sheet-tab" + (rt.sheetTab === id ? " on" : ""), label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", rt.sheetTab === id ? "true" : "false");
      b.setAttribute("data-act", "tab");
      b.setAttribute("data-tab", id);
      tabs.appendChild(b);
    }
    head.appendChild(tabs);
    const close = el("button", "slot sheet-close", "Close");
    close.type = "button";
    close.setAttribute("data-act", "sheet-close");
    head.appendChild(close);
    sheet.appendChild(head);

    // Every tab is built; only the chosen one shows.
    const body = el("div", "sheet-body");
    for (const [id, , fn] of [["character", 0, renderCharacter], ["pack", 0, renderPack], ["ledger", 0, renderLedger]]) {
      const pane = el("div", "sheet-pane");
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("data-pane", id);
      pane.hidden = rt.sheetTab !== id;
      fn(s, pane);
      body.appendChild(pane);
    }
    sheet.appendChild(body);
    body.scrollTop = scrollTop;

    // Keep an open tooltip on the rebuilt anchor.
    tips.reanchor();
  }

  // What the sheet shows, minus the clock; re-render only when it moves.
  function signature() {
    const s = rt.session || {};
    const L = Object.assign({}, s.stats || {}, { playSeconds: 0, delveSeconds: 0 });
    const v = rt.vitals || {};
    return JSON.stringify([s.level, s.xp, s.skillPoints, s.purse, s.bank, s.materials, s.equipped, s.pack, s.tracks,
      s.bestDepth, s.stash ? s.stash.length : 0, L, rt.space, Math.ceil(v.hp || 0), Math.floor(v.mp || 0), rt.sheetTab]);
  }

  let sig = "";
  function setOpen(open) {
    rt.sheetOpen = !!open;
    sheet.hidden = !open;
    document.body.classList.toggle("window-open", !!open || !!rt.panelOpen);
    tips.hide();
    if (open) {
      // One window at a time: the sheet replaces an open keeper panel.
      if (rt.panelOpen && rt.closePanel) rt.closePanel();
      if (rt.refreshPortrait) rt.refreshPortrait();
      sig = signature();
      render();
    }
  }
  function setTab(id) {
    if (!TABS.some((t) => t[0] === id)) return;
    rt.sheetTab = id;
    tips.hide();
    if (rt.sheetOpen) {
      sig = signature();
      render();
    }
  }
  rt.openSheet = (tab) => {
    if (typeof tab === "string") rt.sheetTab = tab;
    setOpen(true);
  };
  rt.closeSheet = () => setOpen(false);
  rt.toggleSheet = () => setOpen(!rt.sheetOpen);
  rt.sheetSetTab = setTab;

  sheet.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act === "sheet-close") setOpen(false);
    else if (act === "tab") setTab(btn.getAttribute("data-tab"));
  });
  const portrait = document.querySelector("#vitals .portrait");
  if (portrait) {
    portrait.style.cursor = "pointer";
    portrait.style.pointerEvents = "auto";
    portrait.title = "Character (C)";
    portrait.addEventListener("click", () => setOpen(!rt.sheetOpen));
  }
  window.addEventListener("keydown", (e) => {
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyC") setOpen(!rt.sheetOpen);
    else if (e.code === "KeyI") {
      // I opens straight onto the pack.
      if (rt.sheetOpen && rt.sheetTab === "pack") setOpen(false);
      else {
        rt.sheetTab = "pack";
        if (rt.sheetOpen) setTab("pack");
        else setOpen(true);
      }
    } else if (e.code === "Escape" && rt.sheetOpen) setOpen(false);
  });

  // ---- per frame: xp bar, live sheet, level-up line ----
  let lastSig = "";
  let lastLevel = null;
  let sheetT = 0;
  function tick(dt) {
    const s = rt.session || {};
    const level = Math.max(1, int(s.level));
    const need = xpToNext(level);
    const xp = int(s.xp);
    const pts = int(s.skillPoints);
    const xsig = level + ":" + xp + ":" + pts;
    if (xsig !== lastSig) {
      lastSig = xsig;
      xpFill.style.width = Math.max(0, Math.min(100, (xp / Math.max(1, need)) * 100)).toFixed(1) + "%";
      xpLabel.textContent = "Lv " + level + "  ·  " + xp + " / " + need + (pts ? "  ·  " + pts + " pt" + (pts > 1 ? "s" : "") : "");
      xpBar.setAttribute("aria-valuenow", String(xp));
      xpBar.setAttribute("aria-valuemax", String(need));
    }
    // Announce a level gained in play (not a save loading in at a higher level).
    if (lastLevel != null && level > lastLevel) {
      if (rt.say) rt.say("Level " + level + "! A skill point waits at The Circle.");
      if (rt.levelUpFx) rt.levelUpFx(level);
    }
    lastLevel = level;
    if (rt.sheetOpen) {
      sheetT -= dt;
      if (sheetT <= 0) {
        sheetT = 0.25;
        const now = signature();
        if (now !== sig) {
          sig = now;
          render();
        }
        const L = s.stats || {};
        if (timeNode) timeNode.textContent = playTimeText(L.playSeconds);
        if (delveTimeNode) delveTimeNode.textContent = playTimeText(L.delveSeconds);
      }
    }
  }
  // A loaded or fresh ledger sets the level; that is not a level-up.
  for (const name of ["applySaveDoc", "freshGame"]) {
    const prev = rt[name];
    if (typeof prev !== "function") continue;
    rt[name] = function (...args) {
      const out = prev.apply(this, args);
      lastLevel = null;
      return out;
    };
  }

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    tick(dt || 0);
  };
  rt.renderSheet = render;
  rt.sheetNode = sheet;
}
