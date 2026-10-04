// The guide plaque under the minimap: one next step, in the plaque language.
// The minimap draws the matching pin; this file owns the DOM only.

export function attachGuide(rt) {
  const hud = document.getElementById("hud") || document.body;
  const node = document.createElement("section");
  node.id = "guide";
  node.className = "plaque";
  node.hidden = true;
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Next";
  const text = document.createElement("p");
  text.className = "guide-line";
  node.appendChild(eyebrow);
  node.appendChild(text);
  hud.appendChild(node);

  function place() {
    const map = document.getElementById("minimap");
    if (!map) return;
    const r = map.getBoundingClientRect();
    node.style.top = Math.round(r.bottom + 8) + "px";
    node.style.left = Math.round(r.left) + "px";
    node.style.width = Math.round(r.width) + "px";
  }
  window.addEventListener("resize", place);

  // Below ground the guide states the loot rules while they still matter.
  function dungeonHint() {
    const s = rt.session || {};
    const v = rt.vitals || {};
    const carrying = (Array.isArray(s.pack) && s.pack.length) || Math.floor(Number(s.purse) || 0) > 0;
    if (carrying && v.hpMax && v.hp / v.hpMax < 0.35) return "You are hurt. Hold X and stand still to extract: your pack and purse come home.";
    if (Math.floor(Number(s.bestDepth) || 0) < 3) return "Take the stairs (F) deeper, or hold X and stand still to extract with your loot. Falling loses pack and purse.";
    return "";
  }

  let shown = "";
  function tick() {
    const g = rt.space === "town" ? rt.guide : null;
    let want = g ? g.text : rt.space === "dungeon" ? dungeonHint() : "";
    if (rt.sheetOpen) want = "";
    eyebrow.textContent = rt.space === "dungeon" ? "Below" : "Next";
    if (want === shown) return;
    shown = want;
    if (!want) {
      node.hidden = true;
      return;
    }
    text.textContent = want;
    place();
    node.hidden = false;
  }

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    tick();
  };
  rt.guideNode = node;
}
