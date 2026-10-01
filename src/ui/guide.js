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

  let shown = "";
  function tick() {
    const g = rt.space === "town" ? rt.guide : null;
    const want = g ? g.text : "";
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
