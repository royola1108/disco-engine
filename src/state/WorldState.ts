import type { Value } from "../engine/ast.js";
import type { VariableDef } from "../engine/types.js";

export interface Skills {
  volition: { current: number; damage: number };
  endurance: { current: number; damage: number };
  [skill: string]: { current: number; damage: number };
}

export interface WorldStateData {
  variables: Record<string, Value>;
  inventory: string[];
  equipped: Record<string, string>;
  party: string[];
  time: { day: number; hour: number; totalHours: number };
  reputation: Record<string, number>;
  skills: Skills;
  money: number;
  thc: { known: string[]; fixed: string[]; cooking: string | null };
  political: string | null;
  copotype: string | null;
  flags: Record<string, boolean>;
  meta: Record<string, Value>;
}

export class WorldState {
  variables = new Map<string, Value>();
  inventory = new Set<string>();
  equipped = new Map<string, string>();
  party = new Set<string>();
  time = { day: 1, hour: 9, totalHours: 0 };
  reputation = new Map<string, number>();
  skills: Skills = {
    volition: { current: 0, damage: 0 },
    endurance: { current: 0, damage: 0 },
  };
  money = 0;
  thc = { known: [] as string[], fixed: [] as string[], cooking: null as string | null };
  political: string | null = null;
  copotype: string | null = null;
  flags = new Map<string, boolean>();
  meta = new Map<string, Value>();
  gotoScene: number | null = null;

  initFromRom(defs: VariableDef[]): void {
    this.variables.clear();
    for (const d of defs) {
      const raw = d.initialvalue;
      let v: Value;
      if (raw === "True" || raw === "true") v = true;
      else if (raw === "False" || raw === "false") v = false;
      else {
        const n = Number(raw);
        v = Number.isNaN(n) ? raw : n;
      }
      this.variables.set(d.name, v);
    }
  }

  getVar(name: string): Value {
    return this.variables.get(name) ?? false;
  }

  setVar(name: string, value: Value): void {
    this.variables.set(name, value);
  }

  hasFlag(name: string): boolean {
    return this.flags.get(name) ?? false;
  }

  setFlag(name: string, value: boolean): void {
    this.flags.set(name, value);
  }

  snapshot(): WorldStateData {
    return {
      variables: Object.fromEntries(this.variables),
      inventory: [...this.inventory],
      equipped: Object.fromEntries(this.equipped),
      party: [...this.party],
      time: { ...this.time },
      reputation: Object.fromEntries(this.reputation),
      skills: JSON.parse(JSON.stringify(this.skills)),
      money: this.money,
      thc: { ...this.thc, known: [...this.thc.known], fixed: [...this.thc.fixed] },
      political: this.political,
      copotype: this.copotype,
      flags: Object.fromEntries(this.flags),
      meta: Object.fromEntries(this.meta),
    };
  }

  restore(data: WorldStateData): void {
    this.variables = new Map(Object.entries(data.variables));
    this.inventory = new Set(data.inventory);
    this.equipped = new Map(Object.entries(data.equipped));
    this.party = new Set(data.party);
    this.time = { ...data.time };
    this.reputation = new Map(Object.entries(data.reputation));
    this.skills = JSON.parse(JSON.stringify(data.skills));
    this.money = data.money;
    this.thc = {
      known: [...data.thc.known],
      fixed: [...data.thc.fixed],
      cooking: data.thc.cooking,
    };
    this.political = data.political;
    this.copotype = data.copotype;
    this.flags = new Map(Object.entries(data.flags));
    this.meta = new Map(Object.entries(data.meta));
  }
}
