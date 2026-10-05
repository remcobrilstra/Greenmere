// Walking into buildings. The building that holds the hero is "current": its
// walls, upper storey, and roof are clipped just above the hero's floor (the
// roof still casts its shadow, so the room stays roofed in light), the cut is
// capped, the shared interior light moves in and fades up, and the camera eases
// into the indoor clamps. Buildings with stairs have a second level: on it the
// cut moves up a storey and the hero walks the upstairs floor and colliders.

import {
  buildingAt, floorAt, insideRect, localToWorld, groundAtLevel, nextLevel, upperBuildingAt,
  levelTop, FLOOR_Y, CUTAWAY_H
} from "../sim/townplan.js";
import { CLIP_OFF } from "../view/buildings.js";
import { INDOOR_CLAMPS } from "./camera.js";

const LIGHT_ON = 14;
// Upstairs rooms sit under the roof's shadow with less window light.
const LIGHT_UP = 22;
const LEAVE_PAD = 0.2;

export function attachInteriors(rt) {
  const list = rt.buildings || [];
  const byId = new Map();
  for (let i = 0; i < list.length; i++) byId.set(list[i].def.id, list[i]);
  const light = rt.interiorLight;
  let current = null;
  let currentLevel = 0;

  const outdoorOccluders = [];
  for (let i = 0; i < list.length; i++) outdoorOccluders.push(list[i].shell);
  let indoorOccluders = outdoorOccluders;

  function eyebrow(text) {
    const node = document.querySelector("#minimap .eyebrow");
    if (node && node.textContent !== text) node.textContent = text;
  }

  function floorY(entry, level) {
    return level === 1 ? levelTop(entry.def) : FLOOR_Y;
  }

  function setCutaway(entry, on, level) {
    if (!entry) return;
    if (entry.clip) entry.clip.constant = on ? floorY(entry, level) + CUTAWAY_H : CLIP_OFF;
    if (entry.caps) entry.caps.visible = on && level === 0;
    if (entry.caps1) entry.caps1.visible = on && level === 1;
  }

  function enter(entry, level) {
    if (current === entry && currentLevel === level) return;
    setCutaway(current, false, 0);
    const changedBuilding = current !== entry;
    current = entry;
    currentLevel = entry ? level : 0;
    setCutaway(current, true, currentLevel);
    rt.insideBuilding = current ? current.def : null;
    if (current) {
      const c = localToWorld(current.def, 0, 0);
      if (light) light.position.set(c.x, floorY(current, currentLevel) + 3.0, c.z);
      // The current building is cut away, so it never blocks the camera.
      indoorOccluders = outdoorOccluders.filter((m) => m !== current.shell);
      eyebrow(current.def.name);
    } else if (changedBuilding) {
      eyebrow("Greenmere");
    }
  }

  // Called by movement before grounding: the stairs decide the hero's level.
  function stepHeroLevel(x, z) {
    rt.heroLevel = nextLevel(x, z, rt.heroLevel || 0);
  }

  function heroGroundY(x, z) {
    const g = groundAtLevel(x, z, rt.heroLevel || 0);
    if (g != null) return g;
    return rt.groundY(x, z);
  }

  function tickInteriors(dt) {
    if (rt.space === "dungeon") return;
    if (forced !== undefined) {
      // The first-visit tour (play/intro.js) shows a keeper's room; the hero stays outside.
      enter(forced, 0);
      if (light) {
        const target = forced ? LIGHT_ON : 0;
        light.intensity += (target - light.intensity) * (1 - Math.exp(-6 * dt));
      }
      return;
    }
    const p = rt.player.position;
    const level = rt.heroLevel || 0;
    let def = level === 1 ? upperBuildingAt(p.x, p.z) : null;
    if (!def) def = buildingAt(p.x, p.z);
    // Hysteresis: stay "inside" until the hero is clear of the outer wall face.
    if (!def && current && insideRect(current.def, p.x, p.z, -LEAVE_PAD)) def = current.def;
    enter(def ? byId.get(def.id) || null : null, def ? level : 0);
    if (light) {
      const target = current ? (currentLevel === 1 ? LIGHT_UP : LIGHT_ON) : 0;
      light.intensity += (target - light.intensity) * (1 - Math.exp(-6 * dt));
      if (!current && light.intensity < 0.01) light.intensity = 0;
    }
    if (current) {
      const k = INDOOR_CLAMPS;
      const ease = 1 - Math.exp(-5 * dt);
      if (rt.camPitch < k.pitchMin) rt.camPitch += (k.pitchMin - rt.camPitch) * ease;
      if (rt.camDist > k.distMax) rt.camDist += (k.distMax - rt.camDist) * ease;
    }
  }

  function resetInterior() {
    rt.heroLevel = 0;
    enter(null, 0);
    eyebrow("Greenmere");
    if (light) light.intensity = 0;
  }

  // A building id cuts that building away whatever the hero does; null shows none;
  // undefined hands back to the hero. The tour calls it, then undefined when it ends.
  let forced;
  rt.forceInterior = function (id) {
    if (id === undefined) {
      forced = undefined;
      return;
    }
    forced = id ? byId.get(id) || null : null;
  };

  rt.floorAt = floorAt;
  rt.heroLevel = 0;
  rt.insideBuilding = null;
  rt.tickInteriors = tickInteriors;
  rt.resetInterior = resetInterior;
  rt.stepHeroLevel = stepHeroLevel;
  rt.heroGroundY = heroGroundY;
  rt.interiorLevel = function () { return currentLevel; };
  rt.townOccluders = function () {
    return current ? indoorOccluders : outdoorOccluders;
  };
}
