import type { Expr, Stmt, Value } from "./ast.js";
import { boolish, numish } from "./ast.js";
import { parseCond, parseScript } from "./parser.js";

export type HostFn = (args: Value[], ctx: EvalContext) => Value | void;
export type VarReader = (name: string) => Value;

export interface EvalContext {
  getVar: VarReader;
  setVar: (name: string, value: Value) => void;
  host: FunctionRegistry;
}

export class FunctionRegistry {
  private fns = new Map<string, HostFn>();

  register(name: string, fn: HostFn): void {
    this.fns.set(name, fn);
  }
  get(name: string): HostFn | undefined {
    return this.fns.get(name);
  }
  has(name: string): boolean {
    return this.fns.has(name);
  }
  names(): string[] {
    return [...this.fns.keys()];
  }
}

function evalExpr(e: Expr, ctx: EvalContext): Value {
  switch (e.kind) {
    case "bool": return e.value;
    case "num": return e.value;
    case "str": return e.value;
    case "var": return ctx.getVar(e.name);
    case "call": {
      const fn = ctx.host.get(e.name);
      if (!fn) return false;
      const args = e.args.map((a) => evalExpr(a, ctx));
      return fn(args, ctx) ?? false;
    }
    case "unary": {
      if (e.op === "not") return !boolish(evalExpr(e.operand, ctx));
      return -numish(evalExpr(e.operand, ctx));
    }
    case "binary": {
      if (e.op === "and") return boolish(evalExpr(e.left, ctx)) && boolish(evalExpr(e.right, ctx));
      if (e.op === "or") return boolish(evalExpr(e.left, ctx)) || boolish(evalExpr(e.right, ctx));
      const l = evalExpr(e.left, ctx);
      const r = evalExpr(e.right, ctx);
      switch (e.op) {
        case "==": return looseEq(l, r);
        case ">": return numish(l) > numish(r);
        case ">=": return numish(l) >= numish(r);
        case "<": return numish(l) < numish(r);
        case "<=": return numish(l) <= numish(r);
      }
    }
  }
}

function looseEq(l: Value, r: Value): boolean {
  if (l === null || r === null) return l === r;
  if (typeof l === "boolean" || typeof r === "boolean") return boolish(l) === boolish(r);
  if (typeof l === "number" && typeof r === "number") return l === r;
  if (typeof l === "string" && typeof r === "string") return l === r;
  return boolish(l) === boolish(r);
}

export class ConditionEvaluator {
  constructor(private host: FunctionRegistry) {}
  eval(input: string, getVar: VarReader): boolean {
    const ast = parseCond(input);
    if (!ast) return true;
    const ctx: EvalContext = {
      getVar,
      setVar: () => {},
      host: this.host,
    };
    return boolish(evalExpr(ast, ctx));
  }
}

export class ScriptRunner {
  constructor(private host: FunctionRegistry) {}
  run(input: string, ctx: Omit<EvalContext, "host">): void {
    const stmts = parseScript(input);
    for (const s of stmts) {
      const fn = this.host.get(s.name);
      if (!fn) continue;
      const args = s.args.map((a) => evalExpr(a, { ...ctx, host: this.host }));
      fn(args, { ...ctx, host: this.host });
    }
  }
}
