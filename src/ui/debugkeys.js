// Debug keys.
//
// F2  hides or shows every piece of UI (only the 3D view stays), for clean
//     screenshots. Floating 3D markers that are DOM (foe bars, barks) go too.
// F3  copies where the Warden is to the clipboard: space, position, facing,
//     storey (ground or upstairs), floor and seed below ground, camera, and
//     character level, plus a ?dev URL that drops you back on the same spot
//     (main.js reads at=, cam=, level=, floor=, seed=).

function round(n, d) {
  const k = Math.pow(10, d == null ? 2 : d);
  return Math.round((Number(n) || 0) * k) / k;
}

export function locationReport(rt) {
  const p = rt.player.position;
  const yaw = round(rt.player.rotation.y, 3);
  const cam = [round(rt.camYaw, 3), round(rt.camPitch, 3), round(rt.camDist, 2)].join(",");
  const s = rt.session || {};
  const run = s.run;
  const below = rt.space === "dungeon" && run;
  const storey = rt.heroLevel || 0;
  const base = location.origin + location.pathname;
  let url;
  let where;
  if (below) {
    url = base + "?dev=1&floor=" + run.floorIndex + "&seed=" + (run.runSeed >>> 0) + "&at=" + round(p.x) + "," + round(p.z) + "&cam=" + cam;
    where = "Underwood floor " + run.floorIndex + " (seed " + (run.runSeed >>> 0) + ")";
  } else {
    url = base + "?dev=1&at=" + round(p.x) + "," + round(p.z) + "," + yaw + "&cam=" + cam + (storey ? "&level=" + storey : "");
    where = "Greenmere" + (rt.insideBuilding && rt.insideBuilding.id ? ", inside " + rt.insideBuilding.id : "") + (storey ? ", upstairs" : "");
  }
  const lines = [
    where,
    "pos " + round(p.x) + ", " + round(p.y) + ", " + round(p.z) + "  yaw " + yaw + "  storey " + storey,
    "camera yaw,pitch,dist " + cam,
    "character level " + Math.max(1, Math.floor(Number(s.level) || 1)),
    url
  ];
  return { text: lines.join("\n"), url };
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;left:-9999px;top:0;";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (err) {
    ok = false;
  }
  area.remove();
  return ok;
}

export function attachDebugKeys(rt) {
  rt.uiHidden = false;
  function setUiHidden(on) {
    rt.uiHidden = !!on;
    document.body.classList.toggle("ui-hidden", rt.uiHidden);
  }
  rt.setUiHidden = setUiHidden;
  rt.locationReport = () => locationReport(rt);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "F2") {
      e.preventDefault();
      setUiHidden(!rt.uiHidden);
    } else if (e.code === "F3") {
      e.preventDefault();
      const rep = locationReport(rt);
      rt.lastLocationCopy = rep.text;
      copyText(rep.text).then((ok) => {
        if (rt.say) rt.say(ok ? "Location copied." : "Could not reach the clipboard; see the console.");
        if (!ok) console.log(rep.text);
      });
    }
  });
}
