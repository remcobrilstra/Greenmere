// What Greenmere's people say. Pure: every line is chosen from plain game state
// (depth, level, points, purse, materials, hour), so nothing here is saved.

import { upgradeCost } from "./balance.js";

export const THEMES = [
  { name: "Moss", feel: "green and damp, soft underfoot" },
  { name: "Root", feel: "knotted with roots as thick as a man" },
  { name: "Slate", feel: "cold grey stone and echoing halls" },
  { name: "Ember", feel: "warm, too warm, lit by braziers nobody tends" }
];

export function themeOf(floorIndex) {
  return THEMES[((Math.max(1, floorIndex) - 1) % 4 + 4) % 4];
}

export function partOfDay(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.24 || p >= 0.8) return "night";
  if (p < 0.4) return "morning";
  if (p < 0.7) return "day";
  return "evening";
}

// Plain snapshot of what the lines depend on.
export function loreState(session, phase) {
  const s = session || {};
  const mats = s.materials || {};
  const pack = Array.isArray(s.pack) ? s.pack : [];
  let draughts = 0;
  let spareGear = 0;
  for (const it of pack) {
    if (!it) continue;
    if (it.kind === "consumable") draughts += Math.max(1, Math.floor(Number(it.stack) || 1));
    else spareGear++;
  }
  const weapon = s.equipped && s.equipped.weapon;
  const ilvl = weapon ? Math.max(1, Math.floor(Number(weapon.ilvl) || 1)) : 0;
  return {
    part: partOfDay(phase == null ? 0.5 : phase),
    bestDepth: Math.max(0, Math.floor(Number(s.bestDepth) || 0)),
    level: Math.max(1, Math.floor(Number(s.level) || 1)),
    points: Math.max(0, Math.floor(Number(s.skillPoints) || 0)),
    purse: Math.max(0, Math.floor(Number(s.purse) || 0)),
    bank: Math.max(0, Math.floor(Number(s.bank) || 0)),
    stash: Array.isArray(s.stash) ? s.stash.length : 0,
    heartwood: Math.floor(Number(mats.heartwood) || 0),
    rootfiber: Math.floor(Number(mats.rootfiber) || 0),
    slag: Math.floor(Number(mats.slag) || 0),
    draughts,
    spareGear,
    weaponIlvl: ilvl,
    weaponTheme: weapon ? Math.floor(Number(weapon.themeId) || 0) : 0
  };
}

const GREET = {
  maud: { morning: "Morning, Warden. Shelves are fresh.", day: "Afternoon. Mind the scales.", evening: "Evening. I'm closing soon, but not for you.", night: "Late for shopping. Come in quick." },
  orrin: { morning: "Fire's barely hot. Give it an hour.", day: "Forge is roaring. What needs fixing?", evening: "Last heats of the day.", night: "I don't sleep much. Neither do you, it seems." },
  wen: { morning: "Dew-time is the best time for distilling.", day: "Quietly, please. The still is listening.", evening: "The light goes amber. So do the draughts.", night: "Night brews are the strongest. Or so I tell myself." },
  tamsin: { morning: "Up early. Good.", day: "The stones are warm today.", evening: "Train tired, fight rested.", night: "The circle doesn't close at night." },
  pell: { morning: "Breakfast's porridge. Always porridge.", day: "Quiet hour. Sit anywhere.", evening: "Evening crowd's coming in. Grab a stool.", night: "Last orders were an hour ago. For you, the fire's still banked." },
  aldous: { morning: "The ledger opens at dawn, Warden.", day: "Coin in, coin out. Everything accounted.", evening: "Late deposits are still deposits.", night: "The vault never sleeps. I do, occasionally." }
};

function milestone(id, st) {
  const d = st.bestDepth;
  const lines = {
    maud: ["Haven't been down yet? The gate's up the north road.", "Back from the first floors. Good start.", "Floor " + d + ", I heard. Folk talk about you in the queue.", "Floor " + d + "! I've started stocking for heroes.", "Floor " + d + ". You're the reason this shop has two suppliers."],
    orrin: ["That blade's never tasted the Underwood. Fix that.", "Shallow floors leave shallow nicks. Easy work.", "Floor " + d + " leaves deeper marks. Bring me slag.", "Floor " + d + ". Your gear needs a master's hand now.", "Floor " + d + ". I've stopped pretending I can match what you bring back."],
    wen: ["You'll want a draught or two before the first descent.", "The shallows smell of moss. You do too.", "Floor " + d + " roots make a potent red.", "Floor " + d + ". You'll need the strong mana draughts now.", "Floor " + d + ". I didn't know roots grew that deep."],
    tamsin: ["You've not yet stood in the dark. Go, then come back to me.", "First blood. Now learn to keep yours.", "Floor " + d + ". Your stance is better. Your guard isn't.", "Floor " + d + ". Few wardens reach this far.", "Floor " + d + ". I trained wardens for forty years. None went this deep."],
    pell: ["A warden who's never delved? First drink's on the house when you have.", "Back in one piece. That's the main thing.", "Floor " + d + ". You've earned your stool by the fire.", "Floor " + d + ". People ask me about you now. I make things up.", "Floor " + d + ". We've a song about you. It's not very good."],
    aldous: ["An empty account. Everyone starts somewhere.", "A modest balance for a modest depth.", "Floor " + d + ". Your deposits have grown teeth.", "Floor " + d + ". The bank has hired a second guard. Your fault.", "Floor " + d + ". You could buy this building. Please don't."]
  };
  const tier = d === 0 ? 0 : d < 3 ? 1 : d < 6 ? 2 : d < 10 ? 3 : 4;
  return (lines[id] || [])[tier] || null;
}

// What the keeper's trade suggests right now.
function serviceHint(id, st) {
  if (id === "maud") {
    if (st.spareGear) return "You've " + st.spareGear + " piece" + (st.spareGear > 1 ? "s" : "") + " of gear you aren't wearing. I'll buy them.";
    if (st.draughts < 2) return "Carry draughts. The deep doesn't wait for you to catch your breath.";
    return "Your pack looks sensible. Rare thing.";
  }
  if (id === "orrin") {
    if (!st.weaponIlvl) return "No weapon? Even I can't temper bare hands.";
    if (st.weaponIlvl + 1 > st.bestDepth) return "I can only temper steel to the depth you've returned from. Go deeper first.";
    const cost = upgradeCost(st.weaponIlvl, st.weaponTheme);
    return "Your blade can go to item level " + (st.weaponIlvl + 1) + ". " + cost.gold + " gold and the right materials.";
  }
  if (id === "wen") {
    if (st.heartwood || st.rootfiber) return "You carry " + st.heartwood + " heartwood and " + st.rootfiber + " rootfiber. That's draughts waiting to happen.";
    return "Bring me heartwood and rootfiber from below. I'll do the rest.";
  }
  if (id === "tamsin") {
    if (st.points) return "You have " + st.points + " point" + (st.points > 1 ? "s" : "") + " unspent. Raise a track while you're here.";
    return "No points to spend. Earn a level below, then come back.";
  }
  if (id === "aldous") {
    if (st.purse >= 60) return "You're carrying " + st.purse + " gold. The Underwood keeps a fallen warden's purse. My vault doesn't.";
    if (st.stash) return "Your stash holds " + st.stash + " item" + (st.stash > 1 ? "s" : "") + ". Safe as stone.";
    return "Whatever you leave here survives whatever happens to you down there.";
  }
  return null;
}

// Rumours of the next floor down: theme, and the boss floor ahead.
export function rumour(st) {
  const next = st.bestDepth + 1;
  const t = themeOf(next);
  const boss = Math.ceil(next / 5) * 5;
  const lines = ["Travellers say floor " + next + " is " + t.feel + ". The " + t.name + " floors."];
  if (boss === next) lines.push("Floor " + next + " has something big at the stairs. Every fifth floor does.");
  else lines.push("Something big waits at the stairs of floor " + boss + ". Every fifth floor, they say.");
  return lines;
}

// Combat counsel unlocked by depth (what the next floors bring).
function counsel(st) {
  const d = st.bestDepth;
  if (d < 2) return "Spitters come from floor 2. Their orbs fly straight. Step aside, don't block.";
  if (d < 3) return "Brutes from floor 3. Slow windup, heavy hit. Strike, then step out.";
  if (d < 6) return "Shades from floor 6. They don't come straight at you. Watch the edges of the room.";
  return "Every fifth floor holds a keeper of the stair. Kill it, or extract. There's no shame in leaving.";
}

// The lines a keeper offers when the hero talks, in order. The first is the greeting.
export function talkLines(id, st) {
  const out = [];
  const g = GREET[id];
  if (g) out.push(g[st.part] || g.day);
  const m = milestone(id, st);
  if (m) out.push(m);
  const h = serviceHint(id, st);
  if (h) out.push(h);
  if (id === "pell") for (const r of rumour(st)) out.push(r);
  if (id === "tamsin") out.push(counsel(st));
  if (id === "aldous" && st.bank) out.push("Your balance stands at " + st.bank + " gold.");
  return out;
}

// One next step for a new or returning Warden, or null when there is nothing to nudge.
// target names a station id ("gate", "trainer", ...) for the minimap pin.
export function guideHint(st) {
  if (st.bestDepth === 0 && st.level === 1 && !st.spareGear && st.heartwood === 0 && st.rootfiber === 0) {
    return { target: "gate", text: "The Underwood waits beyond the Delve Gate, north up the road." };
  }
  if (st.points > 0) return { target: "trainer", text: "Spend your skill point" + (st.points > 1 ? "s" : "") + " with Old Tamsin at The Circle." };
  if ((st.heartwood > 0 || st.rootfiber > 0) && st.draughts < 3) return { target: "still", text: "Sister Wen can distill your heartwood and rootfiber at The Still." };
  if (st.spareGear > 0) return { target: "store", text: "Sell gear you don't wear to Maud at Bramble & Board." };
  if (st.purse >= 100) return { target: "bank", text: "A heavy purse dies with you. Bank it at the Counting House." };
  if (st.weaponIlvl && st.weaponIlvl + 1 <= st.bestDepth && st.purse >= upgradeCost(st.weaponIlvl, st.weaponTheme).gold) {
    return { target: "smith", text: "Orrin can temper your blade at The Quench." };
  }
  return null;
}
