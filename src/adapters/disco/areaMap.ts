import type { RomDb } from "../../rom/RomDb.js";

// Maps game area names (from GoTo/GoToDestination calls) to conversation IDs.
// These are derived from dialogues table titles — the original game's area→scene
// mapping isn't in disco.db, so we approximate by matching area names to scene titles.
const AREA_TO_SCENE: Record<string, number> = {
  "Whirling-int-f1": 1274,       // WHIRLING F1 / GARTE MAIN (or nearby)
  "Whirling-int-f3-antechamber": 142, // WHIRLING F2 area (closest match)
  "Church-int": 180,             // CHURCH / MAINFRAME
  "Doomed-commerce-int-f2": 514, // DOOMED F2 / BACK DOOR
  "Instigators-lair-int": 526,   // LAIR / INSTIGATORS TENT
  "Martinaise-ext": 515,         // INVENTORY / MAP OF MARTINAISE (outdoor hub)
  "Second-home-int": 143,        // VILLAGE / SHACK DOOR
  "Tent-int": 567,               // ICE / TENT FLAP
};

export function resolveGoTo(areaName: string, _rom: RomDb): number | null {
  return AREA_TO_SCENE[areaName] ?? null;
}

export function getGotoTargets(): string[] {
  return Object.keys(AREA_TO_SCENE);
}
