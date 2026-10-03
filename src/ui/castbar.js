// Cast bar for held casts: Mend (slot 3, green) and the Hearth (slot 4 in the
// dungeon, gold). It fills over the channel with the seconds left; if the channel
// breaks early (moving, letting go) it flashes "Interrupted" in red. A hit during
// Mend pushes it back: the bar shudders red for a moment (rt.mendPushT).
// Reads rt.castInfo; DOM only.

export function attachCastBar(rt) {
  const hud = document.getElementById("hud") || document.body;
  const node = document.createElement("section");
  node.id = "castbar";
  node.className = "plaque";
  node.hidden = true;
  node.setAttribute("role", "progressbar");
  node.setAttribute("aria-label", "Hearth");
  const label = document.createElement("p");
  label.className = "cast-label";
  const name = document.createElement("span");
  name.textContent = "Hearth";
  const left = document.createElement("span");
  left.className = "cast-left";
  label.appendChild(name);
  label.appendChild(left);
  const track = document.createElement("div");
  track.className = "cast-track";
  const fill = document.createElement("span");
  track.appendChild(fill);
  node.appendChild(label);
  node.appendChild(track);
  hud.appendChild(node);

  let last = 0;
  let lastKind = "";
  let fade = 0;

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    const info = rt.castInfo ? rt.castInfo() : null;
    if (info) {
      const p = Math.min(1, info.t / info.total);
      last = p;
      lastKind = info.kind;
      fade = 0;
      node.hidden = false;
      node.style.opacity = "";
      node.classList.remove("broken");
      node.classList.toggle("mend", info.kind === "mend");
      if (rt.mendPushT > 0) rt.mendPushT = Math.max(0, rt.mendPushT - (dt || 0));
      node.classList.toggle("pushed", rt.mendPushT > 0);
      node.setAttribute("aria-label", info.name);
      name.textContent = info.name;
      left.textContent = Math.max(0, info.total - info.t).toFixed(1) + " s";
      fill.style.width = (p * 100).toFixed(1) + "%";
      node.setAttribute("aria-valuenow", String(Math.round(p * 100)));
      return;
    }
    if (last > 0) {
      // The channel ended. A full bar means the hearth carried the Warden home.
      if (last < 0.98 && (rt.space === "dungeon" || lastKind === "mend")) {
        node.classList.add("broken");
        name.textContent = "Interrupted";
        left.textContent = "";
        fade = 0.9;
      } else {
        fade = 0;
      }
      last = 0;
    }
    if (fade > 0) {
      fade -= dt;
      node.style.opacity = String(Math.min(1, fade / 0.4));
      if (fade <= 0) node.hidden = true;
    } else if (!node.hidden) {
      node.hidden = true;
    }
    if (node.hidden) node.style.opacity = "";
  };
  rt.castBar = {
    shown() { return !node.hidden; },
    text() { return label.textContent; }
  };
}
