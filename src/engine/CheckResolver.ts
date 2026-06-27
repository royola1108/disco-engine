import type { Check, Modifier } from "../engine/types.js";
import type { WorldState } from "../state/WorldState.js";
import type { ConditionEvaluator } from "./eval.js";

export interface CheckResult {
  skill: string;
  difficulty: number;
  isRed: boolean;
  rolls: [number, number];
  modifiers: { name: string; value: number; tooltip: string }[];
  total: number;
  passed: boolean;
  flagName: string | null;
}

export class CheckResolver {
  constructor(
    private state: WorldState,
    private condEval: ConditionEvaluator,
    private getModifiers: (conv: number, dlg: number) => Modifier[]
  ) {}

  resolve(check: Check, convId: number, dlgId: number): CheckResult {
    const skill = check.skilltype ?? "unknown";
    const difficulty = check.difficulty;
    const isRed = check.isred === 1;
    const flagName = check.flagname;

    const skillVal = (this.state.getVar(`character.${skill.toLowerCase().replace(/[^a-z]/g, "_")}`) as number) || 0;

    const modRows = this.getModifiers(convId, dlgId);
    const mods: { name: string; value: number; tooltip: string }[] = [];
    let modTotal = 0;
    for (const m of modRows) {
      const active = m.variable ? this.condEval.eval(m.variable, (n) => this.state.getVar(n)) : true;
      if (active) {
        mods.push({ name: m.variable.slice(0, 40), value: m.modifier, tooltip: m.tooltip ?? "" });
        modTotal += m.modifier;
      }
    }

    const roll1 = 1 + Math.floor(Math.random() * 6);
    const roll2 = 1 + Math.floor(Math.random() * 6);
    const rollSum = roll1 + roll2;
    const total = rollSum + skillVal + modTotal;

    let passed: boolean;
    if (isRed) {
      passed = roll1 === roll2 && rollSum >= difficulty;
    } else {
      passed = total >= difficulty;
    }

    if (flagName) {
      this.state.setVar(flagName, passed);
    }

    return {
      skill,
      difficulty,
      isRed,
      rolls: [roll1, roll2],
      modifiers: mods,
      total,
      passed,
      flagName,
    };
  }
}
