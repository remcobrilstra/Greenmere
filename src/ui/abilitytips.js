// Hover tooltips for the action bar: what each slot does, with the live numbers
// for the Warden's ranks (cost, cast, cooldown, heal, ward size). Slot 4 reads as
// Hearth in town and Extract below. The plain `title` is held aside while the
// tip is up so the browser's own tooltip does not double it. DOM only.

import {
  mendHeal,
  mendCost,
  mendHot,
  mendCastSeconds,
  mendPushback,
  wardCost,
  wardDuration,
  wardAbsorb,
  strikeCooldown,
  strikeRange,
  strikeArcDeg,
  extractSeconds
} from "../sim/balance.js";
import { DRAUGHT_HEAL } from "./panels.js";
import { keyForSlot } from "./hud.js";

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

function rank(rt, id) {
  const tracks = rt.session && rt.session.tracks;
  const n = tracks ? tracks[id] : 0;
  return n > 0 ? n : 0;
}

function draughtCount(rt) {
  const pack = rt.session && Array.isArray(rt.session.pack) ? rt.session.pack : [];
  let n = 0;
  for (const it of pack) {
    if (it && it.kind === "consumable" && it.consumableId === "draught-hp") n += Math.max(0, Math.floor(Number(it.stack) || 0));
  }
  return n;
}

// { name, key, meta: [..small facts], body: "what it does", note? }
export function abilityTip(rt, index) {
  const below = rt.space === "dungeon";
  const key = keyForSlot(index);
  switch (index) {
    case 0: {
      const r = rank(rt, "edge");
      return {
        name: "Strike", key,
        meta: [fmt(strikeCooldown(r)) + " s cooldown"],
        body: "Swing your weapon in a " + strikeArcDeg(r) + "° arc in front of you, reaching " + fmt(strikeRange(r)) + " m. Hits every foe in the arc.",
        note: below ? "" : "Only bites below ground."
      };
    }
    case 1: {
      const r = rank(rt, "bulwark");
      const guard = rt.session && Number.isFinite(rt.session.guard) ? rt.session.guard : 0;
      return {
        name: "Ward", key,
        meta: [wardCost(r) + " mana", "4 s cooldown"],
        body: "Raise a ward that soaks up about " + wardAbsorb(guard, r) + " damage for " + fmt(wardDuration(r)) + " s before your health takes any."
      };
    }
    case 2: {
      const r = rank(rt, "mend");
      const hot = mendHot(r);
      return {
        name: "Mend", key,
        meta: [mendCost(r) + " mana", fmt(mendCastSeconds(r)) + " s cast", "no cooldown"],
        body: "Hold to channel, then heal " + mendHeal(r) + " health" + (hot ? " and " + hot + " more over 4 s" : "") + ". Moving or letting go breaks it and spends nothing.",
        note: "Each hit while casting pushes it back " + fmt(mendPushback(r)) + " s."
      };
    }
    case 3:
      if (below) {
        return {
          name: "Extract", key,
          meta: [fmt(extractSeconds(rank(rt, "delver"))) + " s channel"],
          body: "Hold " + key + " and stand still to hearth home to Greenmere with your pack and purse.",
          note: "Moving or taking a hit breaks it. Falling down here loses what you carry."
        };
      }
      return {
        name: "Hearth", key,
        meta: [],
        body: "Ring the campfire. Below ground this slot becomes Extract, your way home with your loot."
      };
    case 4: {
      const n = draughtCount(rt);
      return {
        name: "Draught", key,
        meta: [n + " carried"],
        body: "Drink a health draught to restore " + DRAUGHT_HEAL + " health at once.",
        note: n ? "" : "Buy them at Bramble & Board."
      };
    }
    case 5:
      return null; // empty slot
    case 6:
      return {
        name: "Focus", key,
        meta: ["10 s cooldown"],
        body: "Draw a slow breath and recover 18 mana."
      };
    case 7:
      return {
        name: "Sprint", key: "Shift",
        meta: ["hold"],
        body: "Hold Shift to run faster. Costs nothing."
      };
    default:
      return null;
  }
}

export function attachAbilityTips(rt) {
  const slots = Array.from(document.querySelectorAll("#actionbar .slot, #extractbar .slot"));
  if (!slots.length) return;
  const tip = document.createElement("div");
  tip.id = "ability-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);

  let hovered = null;
  let sig = "";

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render() {
    if (!hovered) return;
    const info = abilityTip(rt, Number(hovered.dataset.index));
    if (!info) return;
    const next = JSON.stringify(info);
    if (next === sig) return;
    sig = next;
    tip.textContent = "";
    const head = el("div", "tip-head");
    head.append(el("span", "tip-name", info.name), el("span", "tip-key", info.key));
    tip.appendChild(head);
    if (info.meta.length) tip.appendChild(el("div", "tip-meta", info.meta.join("  ·  ")));
    tip.appendChild(el("p", "tip-body", info.body));
    if (info.note) tip.appendChild(el("p", "tip-note", info.note));
  }

  function place() {
    if (!hovered) return;
    const r = hovered.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    tip.style.left = left + "px";
    tip.style.top = Math.max(8, r.top - h - 10) + "px";
  }

  // Keep the browser's tooltip out of the way while ours is up.
  function stashTitle(slot) {
    if (slot.hasAttribute("title")) {
      slot.dataset.title = slot.getAttribute("title");
      slot.removeAttribute("title");
    }
  }

  function show(slot) {
    hovered = slot;
    stashTitle(slot);
    sig = "";
    tip.hidden = false;
    render();
    place();
  }

  function hide() {
    if (hovered && hovered.dataset.title != null && !hovered.hasAttribute("title")) {
      hovered.setAttribute("title", hovered.dataset.title);
    }
    hovered = null;
    tip.hidden = true;
  }

  for (const slot of slots) {
    slot.addEventListener("pointerenter", () => show(slot));
    slot.addEventListener("pointerleave", hide);
    slot.addEventListener("focus", () => show(slot));
    slot.addEventListener("blur", hide);
  }

  // Live numbers (draughts carried, slot 4 changing name) while it is open.
  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    if (!hovered) return;
    stashTitle(hovered);
    render();
    place();
  };
  rt.abilityTip = (index) => abilityTip(rt, index);
}
