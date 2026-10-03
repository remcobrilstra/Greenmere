// What the Warden is carrying and how far along they are:
// - an experience bar in the vitals plaque (level, xp to next, unspent points);
// - a character sheet (I or C, or click the portrait): level, gold, materials,
//   what is worn with its next upgrade cost, and the pack;
// - plain-language reminders of the loot rules below ground;
// - a cast line on level-up and floaters for gold and materials picked up.
// DOM only, built with textContent. Reads the session; changes nothing.

import { xpToNext, upgradeCost } from "../sim/balance.js";
import { affixLines } from "../sim/gearstats.js";

const SLOT_ORDER = ["weapon", "offhand", "head", "body", "feet", "trinket"];
const SLOT_NAME = { weapon: "Weapon", offhand: "Offhand", head: "Head", body: "Body", feet: "Feet", trinket: "Trinket" };
const RARITY_NAME = ["Common", "Uncommon", "Rare", "Epic"];
const RARITY_EDGE = ["#e7d7b4", "#8ed15a", "#7eb6ef", "#d4a03a"];
const MATS = [["heartwood", "Heartwood"], ["rootfiber", "Rootfiber"], ["slag", "Slag"], ["emberglass", "Emberglass"]];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function int(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
function itemName(it) {
  if (!it) return "Empty";
  if (it.kind === "consumable") {
    const n = it.name || (it.consumableId === "draught-mp" ? "Mana Draught" : it.consumableId === "draught-hp" ? "Health Draught" : it.consumableId);
    const stack = int(it.stack);
    return stack > 1 ? n + " ×" + stack : n;
  }
  return it.name || it.baseId || "Gear";
}

// Next +1 for a worn or carried piece: what it costs and whether it can be paid now.
export function upgradeStatus(session, item) {
  if (!item || item.kind === "consumable") return null;
  const ilvl = Math.max(0, Math.floor(Number(item.ilvl) || 0));
  const depth = int(session.bestDepth);
  const cost = upgradeCost(ilvl, Math.floor(Number(item.themeId) || 0));
  const mats = Object.keys(cost.materials || {});
  const parts = [cost.gold + " gold"].concat(mats.map((k) => cost.materials[k] + " " + k));
  if (ilvl + 1 > depth) {
    return { ok: false, text: "Next level needs an extract from floor " + (ilvl + 1) + " (best so far: " + depth + ")." };
  }
  const shortGold = Math.max(0, cost.gold - int(session.purse));
  const shortMats = mats.filter((k) => int(session.materials && session.materials[k]) < cost.materials[k]);
  if (!shortGold && !shortMats.length) return { ok: true, text: "Orrin can take it to item level " + (ilvl + 1) + " now: " + parts.join(", ") + "." };
  const missing = [];
  if (shortGold) missing.push(shortGold + " more gold in your purse" + (int(session.bank) >= shortGold ? " (withdraw it at the Counting House)" : ""));
  for (const k of shortMats) missing.push((cost.materials[k] - int(session.materials[k])) + " more " + k);
  return { ok: false, text: "Item level " + (ilvl + 1) + " costs " + parts.join(", ") + ". You need " + missing.join(" and ") + "." };
}

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

  // ---- the sheet ----
  const sheet = el("section", "plaque");
  sheet.id = "sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-label", "Character");
  hud.appendChild(sheet);
  rt.sheetOpen = false;

  function place() {
    const map = document.getElementById("minimap");
    if (!map) return;
    const r = map.getBoundingClientRect();
    sheet.style.top = Math.round(r.bottom + 8) + "px";
  }
  window.addEventListener("resize", place);

  function section(label) {
    sheet.appendChild(el("p", "section-label", label));
  }
  function line(text, cls) {
    sheet.appendChild(el("p", "sheet-line" + (cls ? " " + cls : ""), text));
  }

  function render() {
    const s = rt.session || {};
    const below = rt.space === "dungeon";
    while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
    const head = el("div", "sheet-head");
    head.appendChild(el("p", "eyebrow", "Character"));
    const close = el("button", "slot sheet-close", "Close");
    close.type = "button";
    close.setAttribute("data-act", "sheet-close");
    head.appendChild(close);
    sheet.appendChild(head);

    const level = Math.max(1, int(s.level));
    const need = xpToNext(level);
    line("Level " + level + "  ·  " + int(s.xp) + " / " + need + " xp to level " + (level + 1));
    const pts = int(s.skillPoints);
    line(pts ? pts + " skill point" + (pts > 1 ? "s" : "") + " to spend with Old Tamsin at The Circle." : "No skill points to spend.", pts ? "gold" : "");
    line("Deepest extract: floor " + int(s.bestDepth) + ".");

    section("Gold");
    line("Purse " + int(s.purse) + (below ? "  ·  lost if you fall" : "  ·  pays for upgrades and goods"), below ? "risk" : "");
    line("Bank " + int(s.bank) + "  ·  safe at the Counting House");

    section("Materials  ·  always kept");
    const mats = el("div", "sheet-mats");
    for (const [k, name] of MATS) mats.appendChild(el("span", "", name + " " + int(s.materials && s.materials[k])));
    sheet.appendChild(mats);

    section("Worn  ·  always kept");
    const eq = s.equipped || {};
    for (const key of SLOT_ORDER) {
      const it = eq[key];
      const row = el("div", "sheet-item");
      const rarity = it ? Math.max(0, Math.min(3, int(it.rarity))) : 0;
      row.style.borderLeftColor = it ? RARITY_EDGE[rarity] : "transparent";
      row.appendChild(el("span", "name", SLOT_NAME[key] + "  ·  " + itemName(it) + (it ? "  ·  ilvl " + int(it.ilvl) : "")));
      if (it && it.affixes && it.affixes.length) row.appendChild(el("span", "affix", RARITY_NAME[rarity] + "  ·  " + affixLines(it).join(", ")));
      const up = upgradeStatus(s, it);
      if (up) row.appendChild(el("span", "affix" + (up.ok ? " gold" : ""), up.text));
      sheet.appendChild(row);
    }

    const pack = Array.isArray(s.pack) ? s.pack : [];
    section("Pack " + pack.length + " / 24" + (below ? "  ·  lost if you fall" : ""));
    if (!pack.length) line("Empty.", "muted");
    for (const it of pack) {
      const row = el("div", "sheet-item");
      const rarity = it && it.kind !== "consumable" ? Math.max(0, Math.min(3, int(it.rarity))) : 0;
      row.style.borderLeftColor = RARITY_EDGE[rarity];
      row.appendChild(el("span", "name", itemName(it) + (it && it.kind !== "consumable" ? "  ·  ilvl " + int(it.ilvl) : "")));
      sheet.appendChild(row);
    }
    const stash = Array.isArray(s.stash) ? s.stash.length : 0;
    line("Stash " + stash + " / 48  ·  safe at the Counting House.", "muted");

    section("How loot works");
    line("Gold, materials, and gear drop where foes fall. Walk over them to pick them up; gear needs room in the pack.");
    line("Hold 4 below ground, standing still, to extract: everything you carry comes home.");
    line("Fall in the Underwood and you lose your pack and purse. Worn gear, materials, the bank, and the stash are always kept.");
    place();
  }

  function setOpen(open) {
    rt.sheetOpen = !!open;
    sheet.hidden = !open;
    if (open) render();
  }
  rt.openSheet = () => setOpen(true);
  rt.closeSheet = () => setOpen(false);
  rt.toggleSheet = () => setOpen(!rt.sheetOpen);

  sheet.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (btn && btn.getAttribute("data-act") === "sheet-close") setOpen(false);
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
    if (e.code === "KeyI" || e.code === "KeyC") setOpen(!rt.sheetOpen);
    else if (e.code === "Escape" && rt.sheetOpen) setOpen(false);
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
    const sig = level + ":" + xp + ":" + pts;
    if (sig !== lastSig) {
      lastSig = sig;
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
        sheetT = 0.5;
        render();
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
