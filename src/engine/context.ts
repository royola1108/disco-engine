import { RomDb } from "../rom/RomDb.js";
import { WorldState } from "../state/WorldState.js";
import { SaveStore } from "../state/SaveStore.js";
import { FunctionRegistry } from "../engine/eval.js";
import { Engine } from "../engine/Engine.js";
import { registerDiscoFunctions } from "../adapters/disco/DiscoFunctions.js";

import { ALL_SKILLS } from "../adapters/disco/builds.js";

export interface GameContext {
  rom: RomDb;
  state: WorldState;
  registry: FunctionRegistry;
  engine: Engine;
  saves: SaveStore;
}

export function createGameContext(dbPath: string, savesDir: string): GameContext {
  const rom = new RomDb(dbPath);
  const state = new WorldState();
  const registry = new FunctionRegistry();
  const saves = new SaveStore(savesDir);

  state.initFromRom(rom.getAllVariableDefs());
  state.initSkills("balanced", ALL_SKILLS);
  state.party.add("kim");
  registerDiscoFunctions(registry, state, rom);

  const engine = new Engine(rom, state, registry);

  return { rom, state, registry, engine, saves };
}

export function startGame(ctx: GameContext, sceneId: number, reset = false, build?: string) {
  if (reset) {
    const fresh = new WorldState();
    fresh.initFromRom(ctx.rom.getAllVariableDefs());
    fresh.initSkills(build ?? "balanced", ALL_SKILLS);
    fresh.party.add("kim");
    ctx.state.restore(fresh.snapshot());
    ctx.engine.history = [];
  } else if (build !== undefined) {
    ctx.state.initSkills(build, ALL_SKILLS);
  }
  return ctx.engine.startScene(sceneId);
}
