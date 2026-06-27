import { EventEmitter } from "node:events";
import type { RomDb } from "../rom/RomDb.js";
import type { WorldState } from "../state/WorldState.js";
import type { DialogueNode, DLink } from "./types.js";
import { START_DIALOGUE_ID } from "./types.js";
import type { CheckResult } from "./CheckResolver.js";
import { FunctionRegistry, ConditionEvaluator, ScriptRunner } from "./eval.js";
import { CheckResolver } from "./CheckResolver.js";
import { boolish, type Value } from "./ast.js";

export interface Option {
  index: number;
  text: string;
  actorName: string;
  destinationConv: number;
  destinationDlg: number;
}

export interface TraceEntry {
  type: "text" | "check" | "choose" | "scene_end" | "variable" | "info";
  actorName?: string;
  text?: string;
  check?: CheckResult;
  optionIndex?: number;
  optionText?: string;
  variable?: string;
  oldValue?: Value;
  newValue?: Value;
  message?: string;
}

export type StopReason = "no_choices" | "check" | "scene_end" | "max_steps" | "choices_exhausted";

export interface PlayParams {
  choices?: number[];
  autoAdvance?: boolean;
  stopAt?: StopReason[];
  maxSteps?: number;
}

export interface PlayResult {
  trace: TraceEntry[];
  options: Option[];
  stoppedAt: StopReason;
  currentConv: number;
  currentDlg: number;
  stepsTaken: number;
}

export interface EngineEvents {
  "node:enter": (conv: number, dlg: number) => void;
  "node:text": (actorName: string, text: string) => void;
  "check:roll": (result: CheckResult) => void;
  "options:show": (options: Option[]) => void;
  "option:choose": (index: number, option: Option) => void;
  "scene:end": (conv: number) => void;
  "var:change": (name: string, oldVal: Value, newVal: Value) => void;
}

export class Engine extends EventEmitter {
  currentConv = 0;
  currentDlg = 0;
  history: TraceEntry[] = [];
  private condEval: ConditionEvaluator;
  private scriptRunner: ScriptRunner;
  private checkResolver: CheckResolver;
  private varBefore: Map<string, Value> = new Map();

  constructor(
    private rom: RomDb,
    private state: WorldState,
    private registry: FunctionRegistry
  ) {
    super();
    this.condEval = new ConditionEvaluator(registry);
    this.scriptRunner = new ScriptRunner(registry);
    this.checkResolver = new CheckResolver(
      state,
      this.condEval,
      (c, d) => rom.getModifiers(c, d)
    );
  }

  startScene(conversationId: number): PlayResult {
    this.currentConv = conversationId;
    this.currentDlg = START_DIALOGUE_ID;
    this.history = [];
    return this.play({ autoAdvance: true, stopAt: ["no_choices", "check"] });
  }

  isConnector(node: DialogueNode): boolean {
    const text = node.dialoguetext;
    if (!text || text.trim() === "" || text.trim() === "0") return true;
    if (node.title && node.title.startsWith("!(") || node.title?.startsWith("Variable[")) return true;
    return false;
  }

  private getVar = (name: string): Value => this.state.getVar(name);

  private setVartracked = (name: string, value: Value): void => {
    const old = this.state.getVar(name);
    if (old !== value) {
      this.history.push({ type: "variable", variable: name, oldValue: old, newValue: value });
      this.emit("var:change", name, old, value);
    }
    this.state.setVar(name, value);
  };

  private evalCondition(cond: string | null): boolean {
    if (!cond || !cond.trim()) return true;
    return this.condEval.eval(cond, this.getVar);
  }

  private resolveText(node: DialogueNode): string {
    if (node.hasalts === 1) {
      const alts = this.rom.getAlternates(node.conversationid, node.id);
      for (const alt of alts) {
        if (!alt.condition || this.evalCondition(alt.condition)) {
          return alt.alternateline ?? "";
        }
      }
    }
    return node.dialoguetext ?? "";
  }

  private getVisibleOptions(node: DialogueNode): Option[] {
    const links = this.rom.getOutLinks(node.conversationid, node.id);
    const options: Option[] = [];
    for (const link of links) {
      const dest = this.rom.getNode(link.destinationconversationid, link.destinationdialogueid);
      if (!dest) continue;
      if (!this.evalCondition(dest.conditionstring)) continue;
      const text = this.resolveText(dest);
      const actorName = this.rom.actorName(dest.actor);
      options.push({
        index: options.length,
        text: text || dest.title || `(-> ${dest.id})`,
        actorName,
        destinationConv: link.destinationconversationid,
        destinationDlg: link.destinationdialogueid,
      });
    }
    return options;
  }

  private runNodeScript(node: DialogueNode): void {
    if (!node.userscript || !node.userscript.trim()) return;
    this.scriptRunner.run(node.userscript, {
      getVar: this.getVar,
      setVar: this.setVartracked,
    });
  }

  private runSequence(node: DialogueNode): void {
    if (!node.sequence || !node.sequence.trim()) return;
    if (node.sequence === "0" || node.sequence === "") return;
    try {
      this.scriptRunner.run(node.sequence, {
        getVar: this.getVar,
        setVar: this.setVartracked,
      });
    } catch {
      // sequence commands may include audio/camera directives with
      // syntax the parser doesn't handle (paths, @params, etc.)
      // they're visual/audio no-ops in text mode — silently skip
    }
  }

  play(params: PlayParams = {}): PlayResult {
    const {
      choices = [],
      autoAdvance = true,
      stopAt = ["no_choices", "check"],
      maxSteps = 100,
    } = params;

    const trace: TraceEntry[] = [];
    const stopSet = new Set(stopAt);
    let stepsTaken = 0;
    let choiceIdx = 0;
    let lastOptions: Option[] = [];
    let stopReason: StopReason = "max_steps";
    const visited = new Set<string>();

    const addTrace = (e: TraceEntry) => {
      trace.push(e);
      this.history.push(e);
    };

    while (stepsTaken < maxSteps) {
      stepsTaken++;
      const nodeKey = `${this.currentConv}:${this.currentDlg}`;
      const alreadyVisited = visited.has(nodeKey);
      visited.add(nodeKey);
      const node = this.rom.getNode(this.currentConv, this.currentDlg);
      if (!node) {
        addTrace({ type: "info", message: `Node not found: (${this.currentConv},${this.currentDlg})` });
        stopReason = "scene_end";
        break;
      }

      this.emit("node:enter", this.currentConv, this.currentDlg);

      const isConn = this.isConnector(node);

      if (!isConn) {
        const text = this.resolveText(node);
        if (text) {
          const actorName = this.rom.actorName(node.actor);
          addTrace({ type: "text", actorName, text });
          this.emit("node:text", actorName, text);
        }
      }

      this.runNodeScript(node);
      this.runSequence(node);

      // Check for GoTo triggered by script
      if (this.state.gotoScene != null) {
        const nextScene = this.state.gotoScene;
        this.state.gotoScene = null;
        addTrace({ type: "scene_end", message: `Scene ${this.currentConv} → transitioning to scene ${nextScene}` });
        this.emit("scene:end", this.currentConv);
        this.currentConv = nextScene;
        this.currentDlg = START_DIALOGUE_ID;
        continue;
      }

      if (node.hascheck === 1) {
        const check = this.rom.getCheck(node.conversationid, node.id);
        if (check) {
          const result = this.checkResolver.resolve(check, node.conversationid, node.id);
          addTrace({ type: "check", check: result });
          this.emit("check:roll", result);
          if (stopSet.has("check")) {
            const opts = this.getVisibleOptions(node);
            lastOptions = opts;
            this.emit("options:show", opts);
            stopReason = "check";
            break;
          }
        }
      }

      const options = this.getVisibleOptions(node);

      if (options.length === 0) {
        if (this.state.gotoScene != null) {
          const nextScene = this.state.gotoScene;
          this.state.gotoScene = null;
          addTrace({ type: "scene_end", message: `Scene ${this.currentConv} ended → transitioning to scene ${nextScene}` });
          this.emit("scene:end", this.currentConv);
          this.currentConv = nextScene;
          this.currentDlg = START_DIALOGUE_ID;
          continue;
        }
        addTrace({ type: "scene_end", message: `Scene ${this.currentConv} ended (no options)` });
        this.emit("scene:end", this.currentConv);
        stopReason = "scene_end";
        break;
      }

      // Connector nodes with only 1 option: auto-advance (just routing)
      // Connector nodes with multiple options: treat as decision point, stop
      if (isConn && autoAdvance && options.length === 1) {
        const opt = options[0]!;
        const destKey = `${opt.destinationConv}:${opt.destinationDlg}`;
        if (visited.has(destKey) && choices.length === 0) {
          lastOptions = options;
          this.emit("options:show", options);
          stopReason = "no_choices";
          break;
        }
        this.currentConv = opt.destinationConv;
        this.currentDlg = opt.destinationDlg;
        continue;
      }

      if (options.length === 1 && autoAdvance) {
        const opt = options[0]!;
        const destKey = `${opt.destinationConv}:${opt.destinationDlg}`;
        if (visited.has(destKey) && choices.length === 0) {
          lastOptions = options;
          this.emit("options:show", options);
          stopReason = "no_choices";
          break;
        }
        this.currentConv = opt.destinationConv;
        this.currentDlg = opt.destinationDlg;
        continue;
      }

      lastOptions = options;
      this.emit("options:show", options);

      if (choiceIdx < choices.length) {
        const pick = choices[choiceIdx]!;
        choiceIdx++;
        if (pick < 0 || pick >= options.length) {
          addTrace({ type: "info", message: `Invalid choice index ${pick}, stopping` });
          stopReason = "no_choices";
          break;
        }
        const opt = options[pick]!;
        addTrace({ type: "choose", optionIndex: pick, optionText: opt.text });
        this.emit("option:choose", pick, opt);
        this.currentConv = opt.destinationConv;
        this.currentDlg = opt.destinationDlg;
        continue;
      }

      if (stopSet.has("no_choices")) {
        stopReason = "no_choices";
        break;
      }

      stopReason = "choices_exhausted";
      break;
    }

    if (stepsTaken >= maxSteps && stopReason === "max_steps") {
      addTrace({ type: "info", message: `Max steps (${maxSteps}) reached` });
    }

    return {
      trace,
      options: lastOptions,
      stoppedAt: stopReason,
      currentConv: this.currentConv,
      currentDlg: this.currentDlg,
      stepsTaken,
    };
  }

  getStatus() {
    return {
      currentConv: this.currentConv,
      currentDlg: this.currentDlg,
      scene: this.rom.getScene(this.currentConv)?.title ?? `conv ${this.currentConv}`,
      money: this.state.money,
      day: this.state.time.day,
      hour: this.state.time.hour,
      party: [...this.state.party],
      inventory: [...this.state.inventory],
      skills: this.state.skills,
      reputation: Object.fromEntries(this.state.reputation),
      activeTasks: this.getActiveTasks(),
    };
  }

  private getActiveTasks(): string[] {
    const tasks: string[] = [];
    for (const [name, val] of this.state.variables) {
      if (name.startsWith("TASK.") && boolish(val)) {
        const done = this.state.getVar(`${name}_done`);
        if (!boolish(done)) tasks.push(name);
      }
    }
    return tasks;
  }
}
