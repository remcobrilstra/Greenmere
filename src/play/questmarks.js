// Quest marks over the town's givers. A keeper with a request to offer wears a
// yellow "!"; a keeper (or the notice board) holding a finished quest wears a
// yellow "?". A quest in progress shows nothing. A keeper working indoors would
// hide the mark under the roof, so while the Warden is outside that building the
// mark hangs over its front door instead. Reads the quest API on rt only.

import { buildQuestMark } from "../view/questmarks.js";
import { PROPS, doorPoint, localToWorld, wallHeight, insideRect } from "../sim/townplan.js";

const STATION_OF = { maud: "store", orrin: "smith", wen: "still", tamsin: "trainer", pell: "inn", aldous: "bank" };
const CHECK_EVERY = 0.4;

export function attachQuestMarks(rt) {
  const marks = [];
  for (const f of rt.townfolk || []) {
    if (f.kind !== "keeper" || f.vendor || !STATION_OF[f.id]) continue;
    const mark = buildQuestMark();
    mark.group.name = "questMark:" + f.id;
    rt.townRoot.add(mark.group);
    const lift = 2.15 * ((f.def && f.def.look && f.def.look.height) || 1) + 0.35;
    const b = f.building;
    let door = null;
    if (b && b.doors && b.doors.length) {
      const local = doorPoint(b, b.doors[0], 0.7);
      door = localToWorld(b, local.x, local.z);
      door.lift = wallHeight(b) + 0.35;
    }
    marks.push({ giver: f.id, mark, folk: f, lift, door, state: "" });
  }
  for (const p of PROPS) {
    if (p.type !== "notice") continue;
    const mark = buildQuestMark();
    mark.group.name = "questMark:board";
    rt.townRoot.add(mark.group);
    marks.push({ giver: "board", mark, x: p.x, z: p.z, y: 0, lift: 2.9, state: "" });
  }

  function stateFor(entry) {
    if (!rt.session || !rt.keeperRequest) return "";
    if (entry.giver === "board") {
      const ready = rt.questsReady ? rt.questsReady() : [];
      if (ready.some((r) => r.quest.giver === "board")) return "ask";
      const b = rt.questBoard ? rt.questBoard() : null;
      return b && b.offers.length && b.active.length < b.cap ? "bang" : "";
    }
    const req = rt.keeperRequest(STATION_OF[entry.giver]);
    if (!req) return "";
    if (req.state === "offer") return "bang";
    return rt.questComplete && rt.questComplete(req.quest) ? "ask" : "";
  }

  function refresh() {
    for (const e of marks) {
      const state = stateFor(e);
      if (state === e.state) continue;
      e.state = state;
      e.mark.group.visible = !!state;
      e.mark.bang.visible = state === "bang";
      e.mark.ask.visible = state === "ask";
    }
  }

  let checkT = 0;
  let clock = 0;
  function tick(dt) {
    if (rt.space !== "town") return;
    clock += dt;
    checkT -= dt;
    if (checkT <= 0) {
      checkT = CHECK_EVERY;
      refresh();
    }
    for (let i = 0; i < marks.length; i++) {
      const e = marks[i];
      if (!e.state) continue;
      const g = e.mark.group;
      const bob = Math.sin(clock * 2.6 + i) * 0.08;
      if (e.folk) {
        const p = e.folk.v.root.position;
        const b = e.folk.building;
        const indoors = e.door && b && insideRect(b, p.x, p.z) && rt.insideBuilding !== b;
        if (indoors) {
          const gy = rt.groundY ? rt.groundY(e.door.x, e.door.z) : 0;
          g.position.set(e.door.x, gy + e.door.lift + bob, e.door.z);
        } else {
          g.position.set(p.x, p.y + e.lift + bob, p.z);
        }
      } else {
        g.position.set(e.x, (rt.groundY ? rt.groundY(e.x, e.z) : 0) + e.lift + bob, e.z);
      }
      // Face the camera (local +z toward it) with a gentle sway, never edge-on.
      const cam = rt.camera.position;
      g.rotation.y = Math.atan2(cam.x - g.position.x, cam.z - g.position.z) + Math.sin(clock * 1.7 + i) * 0.35;
    }
  }

  const prevTick = rt.tickTown;
  rt.tickTown = function (dt, time) {
    if (prevTick) prevTick(dt, time);
    tick(dt);
  };
  rt.questMarks = {
    refresh,
    stateOf(giver) {
      const e = marks.find((m) => m.giver === giver);
      return e ? e.state : null;
    },
    count() { return marks.length; }
  };
}
