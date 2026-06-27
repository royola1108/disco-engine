export type Expr =
  | { kind: "bool"; value: boolean }
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "var"; name: string }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "unary"; op: "not" | "neg"; operand: Expr }
  | {
      kind: "binary";
      op: "and" | "or" | "==" | ">" | ">=" | "<" | "<=";
      left: Expr;
      right: Expr;
    };

export type Stmt = {
  name: string;
  args: Expr[];
  once: boolean;
};

export type Value = boolean | number | string | null;

export function boolish(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "" && v.toLowerCase() !== "false";
  return false;
}

export function numish(v: Value): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}
