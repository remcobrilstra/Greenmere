// Shared pieces for every screen that shows gear: rendered icons (assets/icons,
// from tools/blender/icons.py) with line glyphs as the fallback, item cells with a
// rarity edge, and one tooltip (#ui-tip) that any container can feed through
// data-tip keys. Used by the character sheet and the keeper panels so items look
// and read the same everywhere. DOM only, built with textContent.

import { affixLines, compareEquip, changeText } from "../sim/gearstats.js";
import { upgradeCost } from "../sim/balance.js";
import { ICONS, ICON_COLS, ICON_ROWS } from "./iconmap.js";

export const SLOT_NAME = { weapon: "Weapon", offhand: "Offhand", head: "Head", body: "Body", feet: "Feet", trinket: "Trinket" };
export const RARITY_NAME = ["Common", "Uncommon", "Rare", "Epic"];
export const RARITY_EDGE = ["#e7d7b4", "#8ed15a", "#7eb6ef", "#d4a03a"];

// 24×24 line glyphs per slot, plus supplies and materials.
const GLYPH = {
  weapon: "M19 3l2 2-10 10-3 1 1-3zM7 15l2 2M5 17l-2 4 4-2M8 14l-3-3",
  offhand: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM12 7v10M8 11h8",
  head: "M4 15l2-7 3 4 3-6 3 6 3-4 2 7zM4 15h16v3H4z",
  body: "M8 4l-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3c-1 2-2 3-4 3S9 6 8 4z",
  feet: "M8 3h5v10l6 3v4H6l-1-4 3-1z M6 20h13",
  trinket: "M8 3c0 4 8 4 8 0M12 7v2M12 9a5 5 0 1 1 0 10 5 5 0 1 1 0-10zM12 12v4M10 14h4",
  draught: "M10 3h4M10 3v5l-4 7a4 4 0 0 0 4 6h4a4 4 0 0 0 4-6l-4-7V3M8 14h8",
  oil: "M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12zM9 15a3 3 0 0 0 3 3",
  kit: "M4 9h16v10H4zM9 9V6h6v3M4 13h16M11 13v2h2v-2",
  gold: "M12 4a8 8 0 1 1 0 16 8 8 0 1 1 0-16zM12 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10z",
  heartwood: "M6 18l6-14 6 14zM9 12h6M12 4v14",
  rootfiber: "M12 3v6M12 9c-3 2-6 4-6 9M12 9c3 2 6 4 6 9M12 9v11",
  slag: "M5 16l3-8 5-3 6 4 1 7-6 3-7-1z",
  emberglass: "M12 3l6 7-6 11-6-11zM6 10h12M12 3v18",
  quest: "M6 3h10l2 3v15H6zM9 8h6M9 12h6M9 16h4",
  rest: "M4 18h16M5 18v-6h14v6M7 12V8h4v4M15 12a3 3 0 0 0-3-3",
  edge: "M19 3l2 2-10 10-3 1 1-3zM7 15l2 2M5 17l-2 4 4-2",
  bulwark: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z",
  mend: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10zM12 9v6M9 12h6",
  delver: "M4 18l6-6-6-6M12 18l6-6-6-6"
};
const SVG_NS = "http://www.w3.org/2000/svg";

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
export function int(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
export function num(v) {
  return int(v).toLocaleString("en-US");
}
export function rarityOf(it) {
  return it && it.kind !== "consumable" ? Math.max(0, Math.min(3, int(it.rarity))) : 0;
}
// Ability and track names that draw with another icon.
const ICON_ALIAS = { edge: "strike", bulwark: "ward", delver: "sprint", draught: "draught-hp" };

// A rendered icon from the sprite sheet, or null when the sheet has no such name.
export function icon(name) {
  const key = ICON_ALIAS[name] || name;
  if (!Object.prototype.hasOwnProperty.call(ICONS, key)) return null;
  const i = ICONS[key];
  const n = el("span", "icon");
  n.setAttribute("aria-hidden", "true");
  n.style.backgroundSize = ICON_COLS * 100 + "% " + ICON_ROWS * 100 + "%";
  n.style.backgroundPosition = ((i % ICON_COLS) / (ICON_COLS - 1)) * 100 + "% " + (Math.floor(i / ICON_COLS) / (ICON_ROWS - 1)) * 100 + "%";
  return n;
}

// The icon a piece of gear or a supply draws with (mirrors view/gearlook.js: heirlooms,
// rarity and theme, and a relic's glow from its third affix).
export function iconName(it) {
  if (!it) return null;
  if (it.kind === "consumable") return it.consumableId || null;
  const slot = it.slot;
  if (!slot) return null;
  if (typeof it.uid === "string" && it.uid.indexOf("heirloom-") === 0) return slot + "-heir";
  const rarity = Math.max(0, Math.min(3, int(it.rarity)));
  const theme = Math.max(0, Math.min(3, int(it.themeId)));
  if (rarity < 3) return slot + "-r" + rarity + "-t" + theme;
  const a = Array.isArray(it.affixes) ? it.affixes[2] : null;
  const relic = a ? Math.max(0, Math.min(3, Math.floor((Number(a.t) || 0) * 4))) : 0;
  return slot + "-r3-t" + theme + "-g" + relic;
}

// The rendered icon for `kind` when there is one, else the line glyph.
export function glyph(kind, color) {
  return icon(kind) || lineGlyph(kind, color);
}

export function lineGlyph(kind, color) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", GLYPH[kind] || GLYPH.trinket);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", color || "currentColor");
  p.setAttribute("stroke-width", "1.6");
  p.setAttribute("stroke-linejoin", "round");
  p.setAttribute("stroke-linecap", "round");
  svg.appendChild(p);
  return svg;
}
// Which glyph an item draws with.
export function itemKind(it) {
  if (!it) return null;
  if (it.kind === "consumable") return it.consumableId === "oil" ? "oil" : it.consumableId === "kit" ? "kit" : "draught";
  return it.slot || "trinket";
}
export function itemName(it) {
  if (!it) return "Empty";
  if (it.kind === "consumable") {
    const n = it.name || (it.consumableId === "draught-mp" ? "Mana Draught" : it.consumableId === "draught-hp" ? "Health Draught" : it.consumableId);
    const stack = int(it.stack);
    return stack > 1 ? n + " ×" + stack : n;
  }
  return it.name || it.baseId || "Gear";
}

// A square item cell: glyph in the rarity colour, rarity border and glow, a corner badge.
// `tag` is "button" for focusable cells, "div" for decoration inside a card.
export function itemCell(it, opts) {
  const o = opts || {};
  const cell = el(o.tag || "div", "gear-cell" + (it ? "" : " empty") + (o.small ? " small" : ""));
  if (cell.tagName === "BUTTON") cell.type = "button";
  const r = rarityOf(it);
  const kind = it ? itemKind(it) : o.slot || o.kind || null;
  const supplyColor = it && it.kind === "consumable" ? (it.consumableId === "draught-mp" ? "#6f9bf0" : it.consumableId === "draught-hp" ? "#e2665a" : "#f3d79a") : null;
  const art = it ? icon(iconName(it)) : o.kind ? icon(o.kind) : null;
  if (art) cell.appendChild(art);
  else if (kind) cell.appendChild(lineGlyph(kind, it || o.kind ? (o.color || supplyColor || RARITY_EDGE[r]) : "rgba(226,186,96,0.35)"));
  if (it) {
    cell.style.borderColor = RARITY_EDGE[r];
    cell.style.setProperty("--rc", RARITY_EDGE[r]);
    if (it.kind === "consumable") {
      if (int(it.stack) > 1) cell.appendChild(el("span", "badge", "×" + int(it.stack)));
    } else cell.appendChild(el("span", "badge", "ilvl " + int(it.ilvl)));
  }
  if (o.tip) cell.setAttribute("data-tip", o.tip);
  return cell;
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

// ---- the shared tooltip ----
let tipNode = null;
function sharedTip() {
  if (tipNode) return tipNode;
  tipNode = el("div", "plaque");
  tipNode.id = "ui-tip";
  tipNode.hidden = true;
  tipNode.setAttribute("role", "tooltip");
  (document.getElementById("hud") || document.body).appendChild(tipNode);
  return tipNode;
}

// Hover and focus tooltips for one container. Register a builder per data-tip key
// (builders call the `line`, `title`, `rule` helpers they are given) on each render.
export function attachTips(root) {
  const tip = sharedTip();
  let builders = new Map();
  let key = null;
  let anchor = null;
  const api = {
    line(text, cls) { tip.appendChild(el("p", "tip-line" + (cls ? " " + cls : ""), text)); },
    title(text) { tip.appendChild(el("p", "tip-line tip-title", text)); },
    rule() { tip.appendChild(el("hr")); },
    tint(color) { tip.style.setProperty("--rc", color); }
  };
  function place() {
    if (!anchor || tip.hidden) return;
    const a = anchor.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Beside the anchor (right, else left); below it when neither side fits.
    let x = a.right + 10;
    let y = a.top;
    if (x + w > vw - 8) x = a.left - w - 10;
    if (x < 8) {
      x = Math.max(8, Math.min(vw - w - 8, a.left));
      y = a.bottom + 8;
    }
    y = Math.max(8, Math.min(vh - h - 8, y));
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }
  function show(node) {
    const k = node && node.getAttribute("data-tip");
    const build = k && builders.get(k);
    if (!build) return hide();
    key = k;
    anchor = node;
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    tip.style.removeProperty("--rc");
    build(api);
    tip.hidden = false;
    place();
  }
  function hide() {
    key = null;
    anchor = null;
    tip.hidden = true;
  }
  function target(e) {
    return e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
  }
  root.addEventListener("pointerover", (e) => {
    const t = target(e);
    if (t && t !== anchor) show(t);
  });
  root.addEventListener("pointerout", (e) => {
    const t = target(e);
    if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hide();
  });
  root.addEventListener("focusin", (e) => {
    const t = target(e);
    if (t) show(t);
  });
  root.addEventListener("focusout", hide);
  root.addEventListener("scroll", hide, true);
  window.addEventListener("resize", place);
  return {
    // Start a render: forget old builders.
    reset() { builders = new Map(); },
    set(k, build) { builders.set(k, build); },
    hide,
    // After a render: keep an open tooltip on the rebuilt anchor.
    reanchor() {
      if (!key) return;
      const again = root.querySelector('[data-tip="' + key + '"]');
      if (again && builders.has(key)) show(again);
      else hide();
    },
    node: tip
  };
}

// The full gear tooltip: name, rarity, affixes, comparison against the worn piece,
// the next upgrade, and what happens to it if you fall.
export function gearTip(session, it, opts) {
  const o = opts || {};
  return (t) => {
    if (!it) {
      t.title(SLOT_NAME[o.slot] || "Empty");
      t.line("Nothing worn here. Gear for this slot drops below ground.", "muted");
      return;
    }
    if (it.kind === "consumable") {
      t.title(itemName(it));
      if (o.supply) t.line(o.supply, "muted");
      return;
    }
    const r = rarityOf(it);
    t.tint(RARITY_EDGE[r]);
    t.title(itemName(it));
    t.line(RARITY_NAME[r] + " " + (SLOT_NAME[it.slot] || "gear").toLowerCase() + "  ·  ilvl " + int(it.ilvl), "muted");
    const lines = affixLines(it);
    t.rule();
    if (lines.length) for (const l of lines) t.line(l, "stat");
    else t.line("No affixes.", "muted");
    if (!o.worn) {
      const cmp = compareEquip(session, it);
      if (cmp) {
        t.rule();
        t.line(cmp.worn ? "If worn instead of " + itemName(cmp.worn) + ":" : "If worn (slot is empty):", "muted");
        if (!cmp.changes.length) t.line("No change.", "muted");
        for (const c of cmp.changes) t.line(changeText(c), c.good ? "up" : "down");
      }
    }
    const up = upgradeStatus(session || {}, it);
    if (up) {
      t.rule();
      t.line(up.text, up.ok ? "gold" : "muted");
    }
    if (o.note) t.line(o.note, "muted small");
  };
}
