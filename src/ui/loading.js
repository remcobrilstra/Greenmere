// The loading card (#loading in index.html): shown from the first paint until every
// model is in and the town's shaders are compiled, then it fades into the game.
// main.js feeds it three's loading-manager progress (this layer does not import three).

const STAGES = [
  [/town\.glb|bank|inn|smith|still|store|trainer|cottage/, "Raising the town"],
  [/nature/, "Growing the Outer Wood"],
  [/warden|hero\.glb/, "Waking the Warden"],
  [/folk|villager/, "Calling the townsfolk"],
  [/critters|animals/, "Letting out the hens"],
  [/dungeon-/, "Carving the Underwood"],
  [/foes-/, "Stirring the deep"]
];

const TIPS = [
  "Hold 4 and stand still to carry your spoils home through the Hearth.",
  "Every ten floors the Underwood changes its face.",
  "Orrin's forge can lift a worn blade a rank.",
  "Rest at the inn before a long delve.",
  "A red beacon over the stairs means a warden still holds the floor.",
  "Townsfolk keep their own hours; the square fills at midday."
];

export function attachLoading() {
  const root = document.getElementById("loading");
  const bar = document.getElementById("loading-fill");
  const stage = document.getElementById("loading-stage");
  const tip = document.getElementById("loading-tip");
  let shown = 0;
  let finished = false;
  if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

  function setStage(text) {
    if (stage && text) stage.textContent = text + "…";
  }
  function setFraction(f) {
    // never runs backwards when more files join the queue
    shown = Math.max(shown, Math.min(1, f));
    if (bar) bar.style.transform = "scaleX(" + shown.toFixed(3) + ")";
  }

  return {
    progress(url, loaded, total) {
      if (finished) return;
      const hit = STAGES.find(([re]) => re.test(url || ""));
      if (hit) setStage(hit[1]);
      // the last tenth is kept for compiling the shaders
      setFraction(total > 0 ? (loaded / total) * 0.9 : 0);
    },
    stage(text, f) {
      setStage(text);
      if (f != null) setFraction(f);
    },
    // Fades the card out; resolves once it is gone. now: hide at once (tests).
    done(now) {
      if (finished) return Promise.resolve();
      finished = true;
      setFraction(1);
      if (!root) return Promise.resolve();
      if (now) {
        root.remove();
        return Promise.resolve();
      }
      return new Promise((res) => {
        root.classList.add("loaded");
        setTimeout(() => {
          root.remove();
          res();
        }, 700);
      });
    },
    get active() {
      return !finished;
    }
  };
}
