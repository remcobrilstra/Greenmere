import { ALL_BUILDINGS, ROADS, SQUARE_R } from "../sim/townplan.js";
// Map plane is world x to the right and world z downward, so -z is up.
// atan2(dir.x, -dir.z): (0,-1) → 0, (1,0) → +π/2 (right).
import {
  mendHeal,
  mendCost,
  mendCooldown,
  mendHot,
  wardCost,
  strikeCooldown
} from "../sim/balance.js";

export function mapAngleFromPlanar(dir) {
  return Math.atan2(dir.x, -dir.z);
}

export function attachHud(rt) {
  document.getElementById("blurb").textContent =
    rt.TREE_COUNT.toLocaleString("en-US") + " trees";

  const abilities = [
    { id: "strike", name: "Strike", cost: 0, cd: 0.55, say: "You cut the air." },
    { id: "ward", name: "Ward", cost: 8, cd: 4, say: "You raise the shield." },
    { id: "mend", name: "Mend", cost: 14, cd: 8, heal: 22, say: "The wood steadies you.", full: "You are already hale." },
    { id: "hearth", name: "Hearth", cost: 0, cd: 1.6, say: "The campfire answers." },
    { id: "draught", name: "Draught", cost: 0, cd: 0, say: "The draught steadies you." },
    { id: "kindle", name: "Kindle", cost: 0, cd: 3, say: "A warm light gathers in your hand." },
    { id: "focus", name: "Focus", cost: 0, cd: 10, mana: 18, say: "You draw a slow breath.", full: "Your focus is already clear." },
    { id: "sprint", name: "Sprint", cost: 0, cd: 0, say: "Hold Shift to run." }
  ];
  const cdLeft = abilities.map(() => 0);
  const vitals = { hp: 126, hpMax: 160, mp: 48, mpMax: 80 };
  const slots = Array.from(document.querySelectorAll("#actionbar .slot"));
  rt.hearthT = 0;
  let castUntil = 0;
  let stationPrompt = "";
  let stationSub = "";
  let stationBarred = false;
  let stationAck = "";
  let stationOwnsLine = false;
  // The F prompt: a key cap and what F does here, above the action bar. Every
  // "press F" moment (counters, villagers, chests, the gate, the stairs) uses it;
  // the cast line only carries the reply.
  const keyPrompt = document.createElement("div");
  keyPrompt.id = "key-prompt";
  keyPrompt.hidden = true;
  const keyCap = document.createElement("span");
  keyCap.className = "key";
  keyCap.textContent = "F";
  const keyLabel = document.createElement("span");
  keyLabel.className = "label";
  const keySub = document.createElement("span");
  keySub.className = "sub";
  keyPrompt.append(keyCap, keyLabel, keySub);
  document.body.appendChild(keyPrompt);
  const mapCanvas = document.getElementById("map-canvas");
  const mapCtx = mapCanvas.getContext("2d");
  const MAP_R = 46;
  const hpBar = document.getElementById("hp-bar");
  const mpBar = document.getElementById("mp-bar");
  const hpFill = document.getElementById("hp-fill");
  const mpFill = document.getElementById("mp-fill");
  const hpLabel = document.getElementById("hp-label");
  const mpLabel = document.getElementById("mp-label");
  const castLine = document.getElementById("cast-line");

  function mapMetrics() {
    const S = mapCanvas.width;
    const c = S * 0.5;
    return { S, c, scale: (c - 14) / MAP_R };
  }
  function worldToMap(x, z) {
    const { c, scale } = mapMetrics();
    return {
      x: c + (x - rt.player.position.x) * scale,
      y: c + (z - rt.player.position.z) * scale
    };
  }
  function playerMapAngle() {
    return mapAngleFromPlanar(rt.playerPlanarDir());
  }
  function cameraMapAngle() {
    return mapAngleFromPlanar(rt.cameraPlanarDir());
  }
  const floaterRoot = document.createElement("div");
  floaterRoot.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:3;";
  document.body.appendChild(floaterRoot);
  const floaterPool = [];
  const floaters = [];
  function pushFloater(text, x, y, z, color) {
    floaters.push({ text: String(text), x, y, z, color: color || "#f4e7c8", life: 0.85 });
  }
  function drawFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life -= dt;
      floaters[i].y += dt * 0.7;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
    while (floaterPool.length < floaters.length) {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;font:18px Palatino, 'Palatino Linotype', 'Book Antiqua', serif;text-shadow:0 1px 0 #2a1c12;white-space:nowrap;";
      floaterRoot.appendChild(el);
      floaterPool.push(el);
    }
    for (let i = 0; i < floaterPool.length; i++) {
      const el = floaterPool[i];
      const f = floaters[i];
      if (!f || !rt.projectWorld) {
        el.style.display = "none";
        continue;
      }
      const p = rt.projectWorld(f.x, f.y, f.z);
      if (p.behind) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.color = f.color;
      el.style.opacity = String(Math.max(0, Math.min(1, f.life / 0.85)));
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      el.textContent = f.text;
    }
  }
  function syncVitals() {
    const hpP = vitals.hpMax > 0 ? vitals.hp / vitals.hpMax : 0;
    const mpP = vitals.mpMax > 0 ? vitals.mp / vitals.mpMax : 0;
    hpFill.style.width = (hpP * 100) + "%";
    mpFill.style.width = (mpP * 100) + "%";
    hpLabel.textContent = Math.round(vitals.hp) + " / " + vitals.hpMax;
    mpLabel.textContent = Math.round(vitals.mp) + " / " + vitals.mpMax;
    hpBar.setAttribute("aria-valuenow", String(vitals.hp));
    hpBar.setAttribute("aria-valuemax", String(vitals.hpMax));
    mpBar.setAttribute("aria-valuenow", String(vitals.mp));
    mpBar.setAttribute("aria-valuemax", String(vitals.mpMax));
    hpBar.classList.toggle("low", vitals.hp > 0 && hpP < 0.3);
  }
  function syncCooldowns() {
    applyRankStats();
    for (let i = 0; i < slots.length; i++) {
      const total = abilities[i].cd;
      const p = total > 0 ? cdLeft[i] / total : 0;
      slots[i].style.setProperty("--p", (Math.max(0, Math.min(1, p)) * 100).toFixed(2));
      slots[i].classList.toggle("cooling", p > 0.004);
    }
  }
  function say(text) {
    castLine.textContent = text;
    castUntil = performance.now() + 2200;
    stationOwnsLine = false;
  }
  function acknowledgementFor(name) {
    if (name === "Hearth") return "The fire is banked and warm.";
    if (name === "The Quench") return "The quench is cold for now.";
    if (name === "The Circle") return "The stones keep their counsel.";
    if (name === "Delve Gate") return "The gate holds.";
    return "Nothing answers.";
  }
  function applyStationLine() {
    keyPrompt.hidden = !stationPrompt;
    keyPrompt.classList.toggle("barred", stationBarred);
    keyLabel.textContent = stationPrompt;
    keySub.textContent = stationSub;
    keySub.hidden = !stationSub;
    keyPrompt.classList.toggle("single", !stationSub);
    if (stationAck) {
      castLine.textContent = stationAck;
      stationOwnsLine = true;
      castUntil = 0;
      return;
    }
    if (stationOwnsLine) {
      castLine.textContent = "";
      stationOwnsLine = false;
    }
  }
  // name: what F does here ("" hides the prompt). opts.sub: a smaller second line;
  // opts.barred: shown in red, F does nothing yet (e.g. a boss holds the stairs).
  function setStationPrompt(name, opts) {
    const next = name || "";
    const sub = (opts && opts.sub) || "";
    const barred = !!(opts && opts.barred);
    if (next === stationPrompt && sub === stationSub && barred === stationBarred) return;
    if (next !== stationPrompt) stationAck = "";
    stationPrompt = next;
    stationSub = sub;
    stationBarred = barred;
    applyStationLine();
  }
  function acknowledgeStation() {
    if (!stationPrompt || stationAck) return false;
    stationAck = acknowledgementFor(stationPrompt);
    applyStationLine();
    return true;
  }
  function clearAcknowledgement() {
    if (!stationAck) return false;
    stationAck = "";
    applyStationLine();
    return true;
  }
  function denySlot(btn) {
    if (!btn) return;
    btn.classList.remove("deny");
    void btn.offsetWidth;
    btn.classList.add("deny");
  }
  function setSlot4Name(name) {
    const slot = slots[3];
    if (!slot) return;
    const label = slot.querySelector(".name");
    if (label) label.textContent = name;
    slot.setAttribute("aria-label", name);
    slot.title = name;
  }
  function trackRank(id) {
    const tracks = rt.session && rt.session.tracks;
    const n = tracks ? tracks[id] : 0;
    return n > 0 ? n : 0;
  }
  function applyRankStats() {
    const edge = trackRank("edge");
    const bulwark = trackRank("bulwark");
    const mend = trackRank("mend");
    abilities[0].cd = strikeCooldown(edge);
    abilities[1].cost = wardCost(bulwark);
    abilities[2].heal = mendHeal(mend);
    abilities[2].cost = mendCost(mend);
    abilities[2].cd = mendCooldown(mend);
    if (slots[1]) {
      slots[1].title = "Ward. " + abilities[1].cost + " mana.";
      slots[1].setAttribute("aria-label", "Ward, " + abilities[1].cost + " mana");
    }
    if (slots[2]) {
      slots[2].title = "Mend. " + abilities[2].cost + " mana.";
      slots[2].setAttribute("aria-label", "Mend, " + abilities[2].cost + " mana");
    }
  }
  function tryAbility(index) {
    applyRankStats();
    const a = abilities[index];
    if (!a) return { ok: false, reason: "missing" };
    if (a.id === "draught") {
      const used = rt.useHealthDraught ? rt.useHealthDraught() : { ok: false, reason: "empty" };
      if (!used.ok) {
        denySlot(slots[index]);
        say(used.reason === "full" ? "You are already hale." : "You have no draught.");
        return { ok: false, reason: used.reason || "empty" };
      }
      say(a.say);
      syncVitals();
      return { ok: true };
    }
    if (rt.space === "dungeon" && a.id === "strike" && rt.beginStrike) return rt.beginStrike();
    if (rt.space === "dungeon" && a.id === "hearth" && rt.beginExtract) return rt.beginExtract();
    if (a.id === "sprint") {
      say(a.say);
      return { ok: false, reason: "hint" };
    }
    if (cdLeft[index] > 0) {
      say(a.name + " is not ready.");
      return { ok: false, reason: "cooldown" };
    }
    if (a.heal && vitals.hp >= vitals.hpMax) {
      say(a.full);
      return { ok: false, reason: "full" };
    }
    if (a.mana && vitals.mp >= vitals.mpMax) {
      say(a.full);
      return { ok: false, reason: "full" };
    }
    if (vitals.mp < a.cost) {
      denySlot(slots[index]);
      say("Not enough mana.");
      return { ok: false, reason: "mana" };
    }
    // Mend is held: nothing is spent until the channel completes (see combat.js).
    if (a.id === "mend" && rt.beginMend) {
      const started = rt.beginMend(() => applyAbility(index));
      if (!started.ok && started.reason === "channel") say("Already mending.");
      return started;
    }
    return applyAbility(index);
  }
  function applyAbility(index) {
    applyRankStats();
    const a = abilities[index];
    if (vitals.mp < a.cost) {
      denySlot(slots[index]);
      say("Not enough mana.");
      return { ok: false, reason: "mana" };
    }
    vitals.mp -= a.cost;
    if (a.heal) vitals.hp = Math.min(vitals.hpMax, vitals.hp + a.heal);
    if (a.id === "mend" && rt.session && mendHot(trackRank("mend")) > 0) {
      rt.session.mendHotLeft = mendHot(trackRank("mend"));
      rt.session.mendHotT = 4;
      rt.session.mendHotAcc = 0;
    }
    if (a.mana) vitals.mp = Math.min(vitals.mpMax, vitals.mp + a.mana);
    if (a.id === "ward" && rt.grantWard) rt.grantWard();
    if (a.id === "hearth") rt.hearthT = 1;
    cdLeft[index] = a.cd;
    say(a.say);
    syncVitals();
    syncCooldowns();
    return { ok: true };
  }
  // Minimap ground per biome (src/sim/biomes.js order): caves, temple, rootdeep, crypt, forge.
  const THEME_FLOOR = ["#2f4a2a", "#6a5434", "#3a2416", "#2f363e", "#4a3024"];
  function themeFloorCss(themeId) {
    const n = Number(themeId);
    const len = THEME_FLOOR.length;
    const id = Number.isFinite(n) ? ((Math.floor(n) % len) + len) % len : 0;
    return THEME_FLOOR[id];
  }
  function foeInAggro(e) {
    return !!(e && e.hp > 0 && (e.state === "approach" || e.state === "telegraph"));
  }
  // Roads, square, and building footprints. North (−z) is up, east (+x) right.
  function drawTownPlan(ctx, scale) {
    ctx.lineCap = "round";
    ctx.strokeStyle = "#a4865c";
    for (let i = 0; i < ROADS.length; i++) {
      const r = ROADS[i];
      const a = worldToMap(r.ax, r.az);
      const b = worldToMap(r.bx, r.bz);
      ctx.lineWidth = Math.max(2, r.w * scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const sq = worldToMap(0, 0);
    ctx.fillStyle = "#9aa0a4";
    ctx.beginPath();
    ctx.arc(sq.x, sq.y, SQUARE_R * scale, 0, Math.PI * 2);
    ctx.fill();
    const inside = rt.insideBuilding;
    for (let i = 0; i < ALL_BUILDINGS.length; i++) {
      const b = ALL_BUILDINGS[i];
      const m = worldToMap(b.x, b.z);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(-b.yaw);
      ctx.fillStyle = inside === b ? "#e7d7b4" : b.closed ? "#6e5a44" : "#8d5b34";
      ctx.fillRect(-b.w / 2 * scale, -b.d / 2 * scale, b.w * scale, b.d * scale);
      if (!b.closed) {
        ctx.fillStyle = "#e2ba60";
        ctx.fillRect(-0.8 * scale, (b.d / 2 - 0.4) * scale, 1.6 * scale, 0.8 * scale);
      }
      ctx.restore();
    }
  }

  // Gold pin for the guide's target; clamped to the rim when it is off the map.
  function drawGuidePin(ctx, c) {
    const g = rt.guide;
    if (!g || g.x == null || rt.space !== "town") return;
    const m = worldToMap(g.x, g.z);
    let dx = m.x - c;
    let dy = m.y - c;
    const rim = c - 18;
    const d = Math.hypot(dx, dy);
    if (d > rim) {
      dx = dx / d * rim;
      dy = dy / d * rim;
    }
    ctx.save();
    ctx.translate(c + dx, c + dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#e2ba60";
    ctx.strokeStyle = "#3a2416";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();
  }

  function drawMinimap() {
    const ctx = mapCtx;
    const { S, c, scale } = mapMetrics();
    const plan = rt.plan;
    const inDungeon = rt.space === "dungeon" && plan && plan.tiles;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 10, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = inDungeon ? themeFloorCss(plan.themeId) : "#1e4a28";
    ctx.fillRect(0, 0, S, S);

    const px = rt.player.position.x;
    const pz = rt.player.position.z;
    const reachSq = (MAP_R + 3) * (MAP_R + 3);
    if (inDungeon) {
      const cols = plan.cols;
      const rows = plan.rows;
      const tile = plan.tile || 4;
      const span = tile * scale;
      ctx.fillStyle = "#8a7356";
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          if (plan.tiles[r * cols + col] !== 1) continue;
          if (rt.tileSeen && !rt.tileSeen(col, r)) continue;
          const x = (col - (cols - 1) / 2) * tile;
          const z = (r - (rows - 1) / 2) * tile;
          const dx = x - px;
          const dz = z - pz;
          if (dx * dx + dz * dz > reachSq) continue;
          const m = worldToMap(x, z);
          ctx.fillRect(m.x - span * 0.5, m.y - span * 0.5, span, span);
        }
      }
    } else {
      const meadow = worldToMap(0, 0);
      ctx.fillStyle = "#4f8c38";
      ctx.beginPath();
      ctx.arc(meadow.x, meadow.y, 44 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7cbf4e";
      ctx.beginPath();
      ctx.arc(meadow.x, meadow.y, 36 * scale, 0, Math.PI * 2);
      ctx.fill();
      drawTownPlan(ctx, scale);

      const treeBases = rt.treeBases;
      for (let i = 0; i < treeBases.length; i++) {
        const t = treeBases[i];
        const dx = t.x - px;
        const dz = t.z - pz;
        if (dx * dx + dz * dz > reachSq) continue;
        ctx.fillStyle = (i & 1) ? "#14381c" : "#1d5c30";
        const m = worldToMap(t.x, t.z);
        ctx.fillRect(m.x - 2.2, m.y - 2.2, 4.4, 4.4);
      }
      ctx.fillStyle = "#6a737c";
      const rocks = rt.rocks;
      for (let i = 0; i < rocks.length; i++) {
        const t = rocks[i];
        const dx = t.x - px;
        const dz = t.z - pz;
        if (dx * dx + dz * dz > reachSq) continue;
        const m = worldToMap(t.x, t.z);
        ctx.fillRect(m.x - 1.6, m.y - 1.6, 3.2, 3.2);
      }
    }

    if (!inDungeon) drawGuidePin(ctx, c);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(cameraMapAngle());
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, c - 16, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38);
    ctx.closePath();
    ctx.fillStyle = "rgba(244, 231, 200, 0.15)";
    ctx.fill();
    ctx.restore();

    if (inDungeon) {
      const cols = plan.cols;
      const rows = plan.rows;
      const tile = plan.tile || 4;
      const stairs = plan.stairs;
      if (stairs) {
        const sx = (stairs.col - (cols - 1) / 2) * tile;
        const sz = (stairs.row - (rows - 1) / 2) * tile;
        const sm = worldToMap(sx, sz);
        const g = tile * scale * 0.42;
        ctx.fillStyle = "#e2ba60";
        ctx.fillRect(sm.x - g * 0.5, sm.y - g * 0.5, g, g);
      }
      const foes = rt.enemies || [];
      ctx.fillStyle = "#8e2e28";
      for (let i = 0; i < foes.length; i++) {
        const e = foes[i];
        if (!foeInAggro(e)) continue;
        const dx = e.x - px;
        const dz = e.z - pz;
        if (dx * dx + dz * dz > reachSq) continue;
        const m = worldToMap(e.x, e.z);
        ctx.fillRect(m.x - 2.6, m.y - 2.6, 5.2, 5.2);
      }
    } else {
      const camp = rt.camp;
      let cdx = camp.x - px;
      let cdz = camp.z - pz;
      const campDist = Math.hypot(cdx, cdz) || 0.0001;
      const rim = MAP_R - 2.2;
      if (campDist > rim) {
        cdx *= rim / campDist;
        cdz *= rim / campDist;
      }
      const campPt = worldToMap(px + cdx, pz + cdz);
      if (rt.hearthT > 0) {
        ctx.beginPath();
        ctx.arc(campPt.x, campPt.y, (1.4 + (1 - rt.hearthT) * 7) * scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 224, 138, " + rt.hearthT.toFixed(3) + ")";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = "#ff8a2a";
      ctx.beginPath();
      ctx.moveTo(campPt.x, campPt.y - 8);
      ctx.lineTo(campPt.x + 6, campPt.y + 5);
      ctx.lineTo(campPt.x - 6, campPt.y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(campPt.x - 1.4, campPt.y - 1, 2.8, 3.2);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(c, c, c - 10, 0, Math.PI * 2);
    ctx.strokeStyle = "#e2ba60";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(playerMapAngle());
    ctx.fillStyle = "#2a1c12";
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f4e7c8";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function tickHud(dt) {
    syncVitals();
    drawFloaters(dt);
    for (let i = 0; i < cdLeft.length; i++) {
      if (cdLeft[i] > 0) cdLeft[i] = Math.max(0, cdLeft[i] - dt);
    }
    if (rt.hearthT > 0) rt.hearthT = Math.max(0, rt.hearthT - dt / 1.1);
    slots[7].classList.toggle("lit", !!(rt.keys.ShiftLeft || rt.keys.ShiftRight));
    syncCooldowns();
    if (castUntil && performance.now() > castUntil) {
      castLine.textContent = "";
      castUntil = 0;
    }
    drawMinimap();
  }
  function resetHud() {
    vitals.hp = 126;
    vitals.hpMax = 160;
    vitals.mp = 48;
    vitals.mpMax = 80;
    for (let i = 0; i < cdLeft.length; i++) cdLeft[i] = 0;
    rt.hearthT = 0;
    castUntil = 0;
    stationAck = "";
    stationPrompt = "";
    stationSub = "";
    stationBarred = false;
    stationOwnsLine = false;
    keyPrompt.hidden = true;
    castLine.textContent = "";
    for (let i = 0; i < slots.length; i++) slots[i].classList.remove("deny", "cooling", "lit");
    syncVitals();
    syncCooldowns();
  }
  document.getElementById("actionbar").addEventListener("click", (e) => {
    const btn = e.target.closest(".slot");
    if (!btn) return;
    tryAbility(Number(btn.dataset.index));
  });
  keyPrompt.addEventListener("click", () => {
    if (!stationPrompt || stationBarred) return;
    if (rt.interactStation) rt.interactStation();
    else acknowledgeStation();
  });

  rt.abilities = abilities;
  rt.cdLeft = cdLeft;
  rt.vitals = vitals;
  rt.slots = slots;
  rt.mapCanvas = mapCanvas;
  rt.mapCtx = mapCtx;
  rt.castLine = castLine;
  rt.keyPrompt = {
    node: keyPrompt,
    label: () => (keyPrompt.hidden ? "" : stationPrompt),
    sub: () => (keyPrompt.hidden ? "" : stationSub),
    barred: () => !keyPrompt.hidden && stationBarred
  };
  rt.tryAbility = tryAbility;
  rt.applyRankStats = applyRankStats;
  rt.say = say;
  rt.syncVitals = syncVitals;
  rt.syncCooldowns = syncCooldowns;
  rt.setSlot4Name = setSlot4Name;
  rt.pushFloater = pushFloater;
  rt.setStationPrompt = setStationPrompt;
  rt.acknowledgeStation = acknowledgeStation;
  rt.clearAcknowledgement = clearAcknowledgement;
  rt.tickHud = tickHud;
  rt.resetHud = resetHud;
  rt.worldToMap = worldToMap;
  rt.mapAngleFromPlanar = mapAngleFromPlanar;
  rt.playerMapAngle = playerMapAngle;
  rt.cameraMapAngle = cameraMapAngle;
  rt.drawMinimap = drawMinimap;

  slots[4].title = "Draught";
  slots[4].setAttribute("aria-label", "Draught");
  const draughtName = slots[4].querySelector(".name");
  if (draughtName) draughtName.textContent = "Draught";
  slots[5].title = "Kindle";
  slots[5].setAttribute("aria-label", "Kindle");
  resetHud();
  drawMinimap();
}
