// The first-visit tour's DOM (#intro): letterbox bars, the "who" card on the left,
// the "what you can do" card on the right, and the step line with Continue and Skip.
// play/intro.js decides what to show and when; this file owns the DOM only.
// textContent, never innerHTML.

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function attachIntroUi(rt, handlers) {
  const root = el("div");
  root.id = "intro";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "A tour of Greenmere");
  root.appendChild(el("div", "in-bar top"));
  root.appendChild(el("div", "in-bar bottom"));

  const who = el("section", "in-card in-who");
  who.setAttribute("aria-live", "polite");
  const eyebrow = el("p", "in-eyebrow");
  const name = el("h2", "in-name");
  const title = el("p", "in-title");
  const text = el("p", "in-text");
  who.append(eyebrow, name, title, text);

  const can = el("section", "in-card in-can");
  const canTitle = el("h3");
  const list = el("ul");
  can.append(canTitle, list);

  const foot = el("div", "in-foot");
  const dots = el("div", "in-dots");
  const next = el("button");
  next.type = "button";
  const nextKey = el("b", null, "Space");
  const nextLabel = el("span", null, "Continue");
  next.append(nextKey, nextLabel);
  const skip = el("button", "in-skip");
  skip.type = "button";
  skip.append(el("b", null, "Esc"), el("span", null, "Skip tour"));
  foot.append(dots, next, skip);
  root.append(who, can, foot);
  document.body.appendChild(root);

  next.addEventListener("click", (e) => { e.stopPropagation(); handlers.next(); });
  skip.addEventListener("click", (e) => { e.stopPropagation(); handlers.skip(); });

  let dotNodes = [];
  function setSteps(total) {
    dots.textContent = "";
    dotNodes = [];
    for (let i = 0; i < total; i++) {
      const d = el("i");
      dots.appendChild(d);
      dotNodes.push(d);
    }
  }

  return {
    // Fills both cards for a stop and slides them in.
    show(stop, index, total, last) {
      if (dotNodes.length !== total) setSteps(total);
      for (let i = 0; i < dotNodes.length; i++) {
        dotNodes[i].className = i === index ? "on" : i < index ? "past" : "";
      }
      eyebrow.textContent = stop.eyebrow || "";
      name.textContent = stop.name || "";
      title.textContent = stop.title || "";
      text.textContent = stop.who || "";
      canTitle.textContent = stop.doTitle || "";
      list.textContent = "";
      for (const line of stop.can || []) list.appendChild(el("li", null, line));
      nextLabel.textContent = last ? "Begin" : "Continue";
      root.classList.add("show", "ready");
    },
    // Slides the cards out while the camera travels.
    away() {
      root.classList.remove("show");
    },
    ready(on) {
      root.classList.toggle("ready", !!on);
    },
    // The bars and step line leave; the node goes once they are off screen.
    finish() {
      root.classList.remove("show", "ready");
      root.classList.add("done");
      setTimeout(() => root.remove(), 1300);
    },
    root
  };
}
