// Writes tools/blender/townplan.json: every building with the derived numbers the
// Blender generator needs (wall boxes, heights, jetty, chimney tops), so models are
// built from the same plan the game uses. Run after changing src/sim/townplan.js.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as tp from "../src/sim/townplan.js";

const out = {
  FLOOR_Y: tp.FLOOR_Y, WALL_T: tp.WALL_T, WALL_H: tp.WALL_H, DOOR_W: tp.DOOR_W, DOOR_H: tp.DOOR_H,
  CUTAWAY_H: tp.CUTAWAY_H, STAIR_W: tp.STAIR_W,
  buildings: tp.BUILDINGS.concat(tp.COTTAGES).map((b) => ({
    id: b.id, name: b.name, x: b.x, z: b.z, yaw: b.yaw, w: b.w, d: b.d,
    wallH: tp.wallHeight(b), upper: b.upper || 0, jetty: tp.jetty(b), roofH: b.roofH, roofColor: b.roofColor,
    style: b.style || null, closed: !!b.closed,
    doors: b.doors, windows: b.windows || [], chimneys: b.chimneys || [], sign: b.sign || null,
    stairs: b.stairs || null, walls: tp.wallBoxes(b),
    furniture: b.furniture || [], upperFurniture: b.upperFurniture || [], levelTop: tp.levelTop(b),
    yard: b.yard || null, ring: b.ring || null
  })),
  props: tp.PROPS, roads: tp.ROADS, SQUARE_R: tp.SQUARE_R, SQUARE_TOP: tp.SQUARE_TOP, HEARTH: tp.HEARTH, GATE: tp.GATE
};
writeFileSync(fileURLToPath(new URL("./blender/townplan.json", import.meta.url)), JSON.stringify(out, null, 1));
console.log("wrote " + out.buildings.length + " buildings");
