// Floor atlas: remembers which tiles of the current floor the Warden has seen and
// draws the whole floor on a plaque (M). The minimap reads the same memory.
// - A tile is seen once its center is within SIGHT metres with a clear tile line.
// - Stairs always show (the beacon stands over the walls); the arrival ring too.
// Canvas and DOM only. Reads rt.plan, the hero, and living foes; changes nothing.

const SIGHT = 11;
const SCAN_EVERY = 0.15;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function attachAtlas(rt) {
  const hud = document.getElementById("hud") || document.body;
  const node = el("section", "plaque");
  node.id = "atlas";
  node.hidden = true;
  node.setAttribute("aria-label", "Floor map");
  const head = el("div", "atlas-head");
  const title = el("p", "eyebrow", "");
  const close = el("button", "slot atlas-close", "Close");
  close.type = "button";
  head.appendChild(title);
  head.appendChild(close);
  const canvas = document.createElement("canvas");
  const legend = el("p", "atlas-legend", "Gold: stairs · ring: arrival · box: chest · diamond: trap · red: foes on your trail · M to close");
  node.appendChild(head);
  node.appendChild(canvas);
  node.appendChild(legend);
  hud.appendChild(node);
  const ctx = canvas.getContext("2d");
  rt.atlasOpen = false;

  // Explored memory for the floor in rt.plan. A new plan object starts a new memory.
  const memory = { plan: null, seen: null, count: 0 };
  rt.explored = memory;

  function reset(plan) {
    memory.plan = plan;
    memory.seen = plan ? new Uint8Array(plan.cols * plan.rows) : null;
    memory.count = 0;
  }

  function scan() {
    const plan = rt.plan;
    if (rt.space !== "dungeon" || !plan || !plan.tiles) {
      if (memory.plan) reset(null);
      return;
    }
    if (memory.plan !== plan) reset(plan);
    const tile = plan.tile || 4;
    const px = rt.player.position.x;
    const pz = rt.player.position.z;
    const reach = Math.ceil(SIGHT / tile);
    const pc = Math.round(px / tile + (plan.cols - 1) / 2);
    const pr = Math.round(pz / tile + (plan.rows - 1) / 2);
    for (let r = pr - reach; r <= pr + reach; r++) {
      for (let c = pc - reach; c <= pc + reach; c++) {
        if (r < 0 || c < 0 || r >= plan.rows || c >= plan.cols) continue;
        const i = r * plan.cols + c;
        if (memory.seen[i] || plan.tiles[i] !== 1) continue;
        const x = (c - (plan.cols - 1) / 2) * tile;
        const z = (r - (plan.rows - 1) / 2) * tile;
        if ((x - px) * (x - px) + (z - pz) * (z - pz) > SIGHT * SIGHT) continue;
        if (rt.losClear && !rt.losClear(px, pz, x, z)) continue;
        memory.seen[i] = 1;
        memory.count++;
      }
    }
  }

  // True when the floor tile at (col, row) has been seen; also true with no memory yet.
  rt.tileSeen = function (col, row) {
    if (!memory.seen || memory.plan !== rt.plan) return true;
    return memory.seen[row * memory.plan.cols + col] === 1;
  };

  function setOpen(open) {
    const want = !!open && rt.space === "dungeon" && !!rt.plan;
    rt.atlasOpen = want;
    node.hidden = !want;
    if (want) {
      scan();
      draw();
    }
  }
  rt.toggleAtlas = () => setOpen(!rt.atlasOpen);
  close.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (e) => {
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyM") setOpen(!rt.atlasOpen);
    else if (e.code === "Escape" && rt.atlasOpen) setOpen(false);
  });

  function draw() {
    const plan = rt.plan;
    if (!plan) return;
    const ratio = window.devicePixelRatio || 1;
    const css = Math.max(220, Math.min(560, Math.floor(Math.min(window.innerWidth - 64, window.innerHeight - 280))));
    if (canvas.width !== Math.round(css * ratio)) {
      canvas.width = Math.round(css * ratio);
      canvas.height = Math.round(css * ratio);
      canvas.style.width = css + "px";
      canvas.style.height = css + "px";
    }
    const S = canvas.width;
    const cell = S / Math.max(plan.cols, plan.rows);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#140e0a";
    ctx.fillRect(0, 0, S, S);
    const seen = memory.plan === plan ? memory.seen : null;
    const isSeen = (c, r) => !seen || seen[r * plan.cols + c] === 1;
    // Rock that borders a seen tile is drawn as a wall edge.
    ctx.fillStyle = "#3a2a1e";
    for (let r = 0; r < plan.rows; r++) {
      for (let c = 0; c < plan.cols; c++) {
        if (plan.tiles[r * plan.cols + c] === 1) continue;
        let edge = false;
        for (let dr = -1; dr <= 1 && !edge; dr++) {
          for (let dc = -1; dc <= 1 && !edge; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= plan.rows || nc >= plan.cols) continue;
            if (plan.tiles[nr * plan.cols + nc] === 1 && isSeen(nc, nr)) edge = true;
          }
        }
        if (edge) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
    ctx.fillStyle = "#8a7356";
    const inset = Math.max(0.5, cell * 0.04);
    for (let r = 0; r < plan.rows; r++) {
      for (let c = 0; c < plan.cols; c++) {
        if (plan.tiles[r * plan.cols + c] !== 1 || !isSeen(c, r)) continue;
        ctx.fillRect(c * cell + inset, r * cell + inset, cell - inset * 2, cell - inset * 2);
      }
    }
    // Arrival ring.
    const e = plan.entrance;
    ctx.strokeStyle = "#e2ba60";
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    ctx.arc((e.col + 0.5) * cell, (e.row + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    // Stairs: a gold diamond, red while a boss holds them.
    const st = plan.stairs;
    let held = false;
    const foes = rt.enemies || [];
    for (let i = 0; i < foes.length; i++) if (foes[i] && foes[i].boss && foes[i].hp > 0) held = true;
    ctx.save();
    ctx.translate((st.col + 0.5) * cell, (st.row + 0.5) * cell);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = held ? "#b64034" : "#e2ba60";
    ctx.strokeStyle = "#3a2416";
    ctx.lineWidth = Math.max(1, cell * 0.05);
    const d = cell * 0.26;
    ctx.fillRect(-d, -d, d * 2, d * 2);
    ctx.strokeRect(-d, -d, d * 2, d * 2);
    ctx.restore();
    // Chests the Warden has seen: gold-edged boxes, dimmed once opened.
    const chests = (rt.dungeonRoot && rt.dungeonRoot.userData.chests) || [];
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i];
      const cc = Math.round(c.x / (plan.tile || 4) + (plan.cols - 1) / 2);
      const cr = Math.round(c.z / (plan.tile || 4) + (plan.rows - 1) / 2);
      if (!isSeen(cc, cr)) continue;
      const cx = (c.x / (plan.tile || 4) + (plan.cols - 1) / 2 + 0.5) * cell;
      const cy = (c.z / (plan.tile || 4) + (plan.rows - 1) / 2 + 0.5) * cell;
      const w = cell * 0.34;
      ctx.fillStyle = c.opened ? "#4a3a2a" : "#8d5b34";
      ctx.strokeStyle = c.opened ? "#6e5a44" : "#e2ba60";
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.fillRect(cx - w / 2, cy - w * 0.35, w, w * 0.7);
      ctx.strokeRect(cx - w / 2, cy - w * 0.35, w, w * 0.7);
    }
    // Traps the Warden has seen, once Delver rank 3 marks them: orange diamonds,
    // dimmed once put out.
    const marks = rt.trapMarks ? rt.trapMarks() : [];
    for (let i = 0; i < marks.length; i++) {
      const t = marks[i];
      const tc = Math.round(t.x / (plan.tile || 4) + (plan.cols - 1) / 2);
      const tr = Math.round(t.z / (plan.tile || 4) + (plan.rows - 1) / 2);
      if (!isSeen(tc, tr)) continue;
      const tx = (tc + 0.5) * cell;
      const ty = (tr + 0.5) * cell;
      const d = cell * 0.24;
      ctx.fillStyle = t.off ? "#6e5a44" : "#e8742a";
      ctx.beginPath();
      ctx.moveTo(tx, ty - d);
      ctx.lineTo(tx + d, ty);
      ctx.lineTo(tx, ty + d);
      ctx.lineTo(tx - d, ty);
      ctx.closePath();
      ctx.fill();
    }
    // Foes on the Warden's trail.
    const tile = plan.tile || 4;
    const toMap = (x, z) => ({
      x: (x / tile + (plan.cols - 1) / 2 + 0.5) * cell,
      y: (z / tile + (plan.rows - 1) / 2 + 0.5) * cell
    });
    ctx.fillStyle = "#b64034";
    for (let i = 0; i < foes.length; i++) {
      const f = foes[i];
      if (!f || !(f.hp > 0) || (f.state !== "approach" && f.state !== "telegraph")) continue;
      const m = toMap(f.x, f.z);
      ctx.fillRect(m.x - cell * 0.12, m.y - cell * 0.12, cell * 0.24, cell * 0.24);
    }
    // The Warden: an arrow along local −z.
    const p = rt.player.position;
    const m = toMap(p.x, p.z);
    // Local −z is forward; with north (−z) up, the arrow turns by −yaw.
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(-rt.player.rotation.y);
    const a = Math.max(5, cell * 0.32);
    ctx.fillStyle = "#f4e7c8";
    ctx.strokeStyle = "#140e0a";
    ctx.lineWidth = Math.max(1, a * 0.15);
    ctx.beginPath();
    ctx.moveTo(0, -a);
    ctx.lineTo(a * 0.75, a * 0.8);
    ctx.lineTo(0, a * 0.35);
    ctx.lineTo(-a * 0.75, a * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const brow = document.querySelector("#minimap .eyebrow");
    title.textContent = brow ? brow.textContent : "";
  }

  let scanT = 0;
  let drawT = 0;
  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    if (rt.atlasOpen && rt.space !== "dungeon") setOpen(false);
    scanT -= dt;
    if (scanT <= 0) {
      scanT = SCAN_EVERY;
      scan();
    }
    if (rt.atlasOpen) {
      drawT -= dt;
      if (drawT <= 0) {
        drawT = 0.1;
        draw();
      }
    }
  };
}
