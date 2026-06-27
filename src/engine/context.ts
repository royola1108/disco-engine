import { RomDb } from "../rom/RomDb.js";
import { WorldState } from "../state/WorldState.js";
import { SaveStore } from "../state/SaveStore.js";
import { FunctionRegistry } from "../engine/eval.js";
import { Engine } from "../engine/Engine.js";
import { registerDiscoFunctions } from "../adapters/disco/DiscoFunctions.js";

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
  state.party.add("kim");
  registerDiscoFunctions(registry, state, rom);

  const engine = new Engine(rom, state, registry);

  return { rom, state, registry, engine, saves };
}
