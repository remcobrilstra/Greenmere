// Speech plaques above townsfolk heads. Play projects the head to screen space
// and calls place(); this file owns the DOM only. textContent, never innerHTML.

const MAX_LIVE = 3;
const FADE = 0.4;

export function attachBarks(rt) {
  const root = document.createElement("div");
  root.id = "barks";
  document.body.appendChild(root);
  const live = new Map();

  function remove(key) {
    const entry = live.get(key);
    if (!entry) return;
    if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
    live.delete(key);
  }

  function say(key, speaker, text, seconds) {
    remove(key);
    if (live.size >= MAX_LIVE) {
      let oldest = null;
      for (const [k, e] of live) if (!oldest || e.born < oldest[1].born) oldest = [k, e];
      if (oldest) remove(oldest[0]);
    }
    const node = document.createElement("div");
    node.className = "bark";
    if (speaker) {
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = speaker;
      node.appendChild(who);
    }
    const line = document.createElement("span");
    line.className = "line";
    line.textContent = text;
    node.appendChild(line);
    node.hidden = true;
    root.appendChild(node);
    live.set(key, { node, ttl: seconds || 3.4, born: performance.now() });
  }

  function place(key, x, y, visible) {
    const entry = live.get(key);
    if (!entry) return;
    entry.node.hidden = !visible;
    if (visible) entry.node.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px) translate(-50%, -100%)";
  }

  function clear() {
    for (const key of Array.from(live.keys())) remove(key);
  }

  function tick(dt) {
    if (rt.space !== "town") {
      if (live.size) clear();
      return;
    }
    for (const [key, entry] of Array.from(live.entries())) {
      entry.ttl -= dt;
      if (entry.ttl <= 0) remove(key);
      else entry.node.style.opacity = String(Math.min(1, entry.ttl / FADE));
    }
  }

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    tick(dt);
  };
  rt.barks = {
    say,
    place,
    clear,
    has(key) { return live.has(key); },
    count() { return live.size; },
    text(key) {
      const e = live.get(key);
      return e ? e.node.textContent : "";
    }
  };
}
