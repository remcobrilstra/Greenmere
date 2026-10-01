// The quest tracker: a small plaque under the minimap (and under the guide when
// it shows) listing carried quests and their progress, in town and below.

export function attachQuestLog(rt) {
  const hud = document.getElementById("hud") || document.body;
  const node = document.createElement("section");
  node.id = "quest-log";
  node.className = "plaque";
  node.hidden = true;
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Quests";
  const list = document.createElement("ul");
  node.appendChild(eyebrow);
  node.appendChild(list);
  hud.appendChild(node);

  function place() {
    const guide = document.getElementById("guide");
    const anchor = guide && !guide.hidden ? guide : document.getElementById("minimap");
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    node.style.top = Math.round(r.bottom + 8) + "px";
    node.style.left = Math.round(r.left) + "px";
    node.style.width = Math.round(r.width) + "px";
  }
  window.addEventListener("resize", place);

  let shown = "";
  function tick() {
    const s = rt.session;
    const active = s && s.quests && Array.isArray(s.quests.active) ? s.quests.active : [];
    const rows = active.map((a) => {
      const done = rt.questComplete ? rt.questComplete(a) : false;
      const p = rt.questProgress ? rt.questProgress(a) : a.progress;
      return [a.title, done ? "done" : p + " / " + a.objective.count, done];
    });
    const guide = document.getElementById("guide");
    const sig = JSON.stringify(rows) + (guide && !guide.hidden ? "g" : "") + (rt.sheetOpen ? "s" : "");
    if (sig === shown) return;
    shown = sig;
    while (list.firstChild) list.removeChild(list.firstChild);
    for (const [title, prog, done] of rows) {
      const li = document.createElement("li");
      if (done) li.className = "done";
      const t = document.createElement("span");
      t.className = "q-title";
      t.textContent = title;
      const p = document.createElement("span");
      p.className = "q-prog";
      p.textContent = prog;
      li.appendChild(t);
      li.appendChild(p);
      list.appendChild(li);
    }
    node.hidden = rows.length === 0 || !!rt.sheetOpen;
    if (!node.hidden) place();
  }

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    tick();
  };
  rt.questLogNode = node;
}
