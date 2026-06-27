import { RomDb } from "../rom/RomDb.js";
import { WorldState } from "../state/WorldState.js";
import { SaveStore } from "../state/SaveStore.js";
import { FunctionRegistry } from "./eval.js";
import { Engine } from "./Engine.js";
import { registerDiscoFunctions } from "../adapters/disco/DiscoFunctions.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export interface PlayerContext {
  playerId: string;
  rom: RomDb;
  state: WorldState;
  registry: FunctionRegistry;
  engine: Engine;
  saves: SaveStore;
  lastActive: number;
}

export class PlayerManager {
  private players = new Map<string, PlayerContext>();
  private rom: RomDb;
  private savesRoot: string;
  private varDefs: ReturnType<RomDb["getAllVariableDefs"]>;

  constructor(rom: RomDb, savesRoot: string) {
    this.rom = rom;
    this.savesRoot = savesRoot;
    this.varDefs = rom.getAllVariableDefs();
  }

  getOrCreate(playerId: string): PlayerContext {
    let ctx = this.players.get(playerId);
    if (ctx) {
      ctx.lastActive = Date.now();
      return ctx;
    }

    const state = new WorldState();
    state.initFromRom(this.varDefs);
    state.party.add("kim");

    const registry = new FunctionRegistry();
    registerDiscoFunctions(registry, state, this.rom);

    const engine = new Engine(this.rom, state, registry);
    const saves = new SaveStore(join(this.savesRoot, playerId));

    ctx = { playerId, rom: this.rom, state, registry, engine, saves, lastActive: Date.now() };
    this.players.set(playerId, ctx);
    return ctx;
  }

  get(playerId: string): PlayerContext | undefined {
    return this.players.get(playerId);
  }

  list(): { playerId: string; scene: string; lastActive: string }[] {
    return [...this.players.values()].map((ctx) => ({
      playerId: ctx.playerId,
      scene: ctx.rom.getScene(ctx.engine.currentConv)?.title ?? `conv ${ctx.engine.currentConv}`,
      lastActive: new Date(ctx.lastActive).toISOString(),
    }));
  }

  newPlayerId(): string {
    return randomUUID().slice(0, 8);
  }

  cleanup(maxIdleMs = 3600_000): void {
    const now = Date.now();
    for (const [id, ctx] of this.players) {
      if (now - ctx.lastActive > maxIdleMs) {
        this.players.delete(id);
      }
    }
  }
}
