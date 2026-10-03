// Health bars over wounded foes. A bar appears once a foe drops below full health,
// trails a pale "lag" chunk behind each hit, shows ward as a blue strip, and goes
// away at full health, on death, out of sight, or past REACH. Elites wear a gold
// edge; a boss gets a wider bar with its name. DOM only, textContent only.
// Reads rt.enemies, rt.projectWorld, rt.losClear; changes nothing.

const REACH = 22;
const LOS_EVERY = 0.2;
const HEAD = { skirmisher: 1.15, brute: 1.95, spitter: 1.0, shade: 1.75, boss: 2.95 };

export function attachFoeBars(rt) {
  const root = document.createElement("div");
  root.id = "foebars";
  document.body.appendChild(root);
  const live = new Map();
  let losT = 0;

  function make(e) {
    const node = document.createElement("div");
    node.className = "foebar" + (e.boss ? " boss" : e.eliteAffix ? " elite" : "");
    if (e.boss) {
      const name = document.createElement("span");
      name.className = "foebar-name";
      name.textContent = rt.bossName || "Warden of the Stair";
      node.appendChild(name);
    }
    const track = document.createElement("div");
    track.className = "foebar-track";
    const lag = document.createElement("span");
    lag.className = "foebar-lag";
    const fill = document.createElement("span");
    fill.className = "foebar-fill";
    const ward = document.createElement("span");
    ward.className = "foebar-ward";
    track.appendChild(lag);
    track.appendChild(fill);
    track.appendChild(ward);
    node.appendChild(track);
    root.appendChild(node);
    const entry = { node, lag, fill, ward, lagPct: 100, lastPct: 100, hold: 0, seen: true, last: -1 };
    live.set(e, entry);
    return entry;
  }

  function drop(e) {
    const entry = live.get(e);
    if (!entry) return;
    if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
    live.delete(e);
  }

  function clear() {
    for (const e of Array.from(live.keys())) drop(e);
  }

  function tick(dt) {
    if (rt.space !== "dungeon" || !rt.projectWorld) {
      if (live.size) clear();
      return;
    }
    const foes = rt.enemies || [];
    const px = rt.player.position.x;
    const pz = rt.player.position.z;
    losT -= dt;
    const recheck = losT <= 0;
    if (recheck) losT = LOS_EVERY;
    const keep = new Set();
    for (let i = 0; i < foes.length; i++) {
      const e = foes[i];
      if (!e || !(e.hp > 0) || !(e.hpMax > 0) || e.hp >= e.hpMax) continue;
      const dx = e.x - px;
      const dz = e.z - pz;
      if (dx * dx + dz * dz > REACH * REACH) continue;
      let entry = live.get(e);
      if (!entry) {
        entry = make(e);
        entry.seen = rt.losClear ? rt.losClear(px, pz, e.x, e.z) : true;
      } else if (recheck) {
        entry.seen = rt.losClear ? rt.losClear(px, pz, e.x, e.z) : true;
      }
      keep.add(e);
      const head = (HEAD[e.boss ? "boss" : e.archetype] || 1.2) * (e.eliteAffix && !e.boss ? 1.12 : 1);
      const p = rt.projectWorld(e.x, head, e.z);
      const visible = entry.seen && !p.behind && p.x > -60 && p.y > -30 && p.x < window.innerWidth + 60 && p.y < window.innerHeight + 30;
      entry.node.hidden = !visible;
      if (!visible) continue;
      entry.node.style.transform = "translate(" + Math.round(p.x) + "px," + Math.round(p.y) + "px) translate(-50%, -100%)";
      const pct = Math.max(0, Math.min(100, (e.hp / e.hpMax) * 100));
      if (pct !== entry.last) {
        entry.fill.style.width = pct.toFixed(1) + "%";
        entry.last = pct;
      }
      // The lag chunk holds briefly, then drains toward the real value.
      if (entry.lagPct <= pct) {
        entry.lagPct = pct;
        entry.hold = 0;
      } else if (pct < entry.lastPct) {
        entry.hold = 0.35;
      } else if (entry.hold > 0) {
        entry.hold -= dt;
      } else {
        entry.lagPct = Math.max(pct, entry.lagPct - dt * 60);
      }
      entry.lastPct = pct;
      entry.lag.style.width = entry.lagPct.toFixed(1) + "%";
      const shield = (e.wardAbsorb > 0 ? e.wardAbsorb : 0) + (e.shadeAbsorb > 0 && e.shadeT > 0 ? e.shadeAbsorb : 0);
      entry.ward.style.width = shield > 0 ? Math.min(100, (shield / e.hpMax) * 100).toFixed(1) + "%" : "0%";
    }
    for (const e of Array.from(live.keys())) if (!keep.has(e)) drop(e);
  }

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    tick(dt);
  };
  rt.foeBars = {
    count() { return live.size; },
    visibleCount() {
      let n = 0;
      for (const entry of live.values()) if (!entry.node.hidden) n++;
      return n;
    },
    clear
  };
}
