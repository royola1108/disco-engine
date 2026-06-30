import type { Expr, Stmt } from "./ast.js";

export type TokenKind =
  | "ident"
  | "number"
  | "string"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "semicolon"
  | "plus"
  | "eq"
  | "ge"
  | "le"
  | "gt"
  | "lt"
  | "bang"
  | "and"
  | "or"
  | "not"
  | "true"
  | "false"
  | "eof";

export interface Token {
  kind: TokenKind;
  text: string;
  pos: number;
}

const KEYWORDS: Record<string, TokenKind> = {
  and: "and",
  or: "or",
  not: "not",
  true: "true",
  false: "false",
};

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}
function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function lexCond(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  const push = (kind: TokenKind, text: string) =>
    tokens.push({ kind, text, pos: i });

  while (i < n) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "-" && input[i + 1] === "-" && input[i + 2] === "[") {
      let j = i + 3;
      const lvl = input[j] === "[" && input[j + 1] === "[" ? 2 : 1;
      if (lvl === 2) j += 2;
      let end: number = -1;
      if (lvl === 1) {
        const close = input.indexOf("]]", j);
        end = close >= 0 ? close + 2 : n;
      } else {
        const close = input.indexOf("]]", j);
        end = close >= 0 ? close + 2 : n;
      }
      i = end >= 0 ? end : n;
      continue;
    }
    if (ch === "-" && input[i + 1] === "-") {
      const nl = input.indexOf("\n", i + 2);
      i = nl >= 0 ? nl : n;
      continue;
    }
    if (ch === "(") { push("lparen", ch); i++; continue; }
    if (ch === ")") { push("rparen", ch); i++; continue; }
    if (ch === "[") { push("lbracket", ch); i++; continue; }
    if (ch === "]") { push("rbracket", ch); i++; continue; }
    if (ch === ",") { push("comma", ch); i++; continue; }
    if (ch === ";") { push("semicolon", ch); i++; continue; }
    if (ch === "+") { push("plus", ch); i++; continue; }
    if (ch === "=" && input[i + 1] === "=") { push("eq", "=="); i += 2; continue; }
    if (ch === ">" && input[i + 1] === "=") { push("ge", ">="); i += 2; continue; }
    if (ch === "<" && input[i + 1] === "=") { push("le", "<="); i += 2; continue; }
    if (ch === ">") { push("gt", ch); i++; continue; }
    if (ch === "<") { push("lt", ch); i++; continue; }
    if (ch === "!") {
      if (input[i + 1] === "=") { push("eq", "!="); i += 2; continue; }
      push("bang", ch); i++; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let buf = "";
      while (j < n && input[j] !== '"') {
        if (input[j] === "\\" && j + 1 < n) {
          buf += input[j + 1];
          j += 2;
        } else {
          buf += input[j];
          j++;
        }
      }
      tokens.push({ kind: "string", text: buf, pos: i });
      i = j + 1;
      continue;
    }
    if (isDigit(ch) || (ch === "-" && isDigit(input[i + 1]!))) {
      let j = i;
      if (ch === "-") j++;
      while (j < n && isDigit(input[j]!)) j++;
      tokens.push({ kind: "number", text: input.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < n && isIdentPart(input[j]!)) j++;
      const word = input.slice(i, j);
      const kw = KEYWORDS[word];
      tokens.push({ kind: kw ?? "ident", text: word, pos: i });
      i = j;
      continue;
    }
    throw new Error(`lexer: unexpected char ${JSON.stringify(ch)} at ${i} in: ${input}`);
  }
  tokens.push({ kind: "eof", text: "", pos: i });
  return tokens;
}

export class CondParser {
  private toks: Token[];
  p = 0;
  constructor(input: string) {
    this.toks = lexCond(input);
  }
  cur(): Token { return this.toks[this.p]!; }
  eat(k: TokenKind): Token {
    const t = this.cur();
    if (t.kind !== k) throw new Error(`parser: want ${k} got ${t.kind}(${t.text})`);
    this.p++;
    return t;
  }
  match(k: TokenKind): boolean {
    if (this.cur().kind === k) { this.p++; return true; }
    return false;
  }
  parseCallArgs(): Expr[] {
    this.eat("lparen");
    const args: Expr[] = [];
    if (this.cur().kind !== "rparen") {
      args.push(this.parseOr());
      while (this.match("comma")) args.push(this.parseOr());
    }
    this.eat("rparen");
    return args;
  }

  parseExpr(): Expr {
    const e = this.parseOr();
    if (this.cur().kind !== "eof") throw new Error(`parser: trailing ${this.cur().kind}`);
    return e;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.cur().kind === "or") { this.p++; const right = this.parseAnd(); left = { kind: "binary", op: "or", left, right }; }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.cur().kind === "and") { this.p++; const right = this.parseNot(); left = { kind: "binary", op: "and", left, right }; }
    return left;
  }
  private parseNot(): Expr {
    if (this.cur().kind === "not") { this.p++; return { kind: "unary", op: "not", operand: this.parseNot() }; }
    if (this.cur().kind === "bang") { this.p++; return { kind: "unary", op: "not", operand: this.parseNot() }; }
    return this.parseCmp();
  }
  private parseCmp(): Expr {
    const left = this.parseAdd();
    const t = this.cur();
    if (t.kind === "eq" || t.kind === "ge" || t.kind === "le" || t.kind === "gt" || t.kind === "lt") {
      const op = t.kind === "eq" ? "==" : t.kind === "ge" ? ">=" : t.kind === "le" ? "<=" : t.kind === "gt" ? ">" : "<";
      this.p++;
      const right = this.parseAdd();
      return { kind: "binary", op, left, right };
    }
    return left;
  }
  private parseAdd(): Expr {
    let left = this.parsePrimary();
    while (this.cur().kind === "plus") {
      this.p++;
      const right = this.parsePrimary();
      left = { kind: "binary", op: "+", left, right };
    }
    return left;
  }
  private parsePrimary(): Expr {
    const t = this.cur();
    if (t.kind === "true") { this.p++; return { kind: "bool", value: true }; }
    if (t.kind === "false") { this.p++; return { kind: "bool", value: false }; }
    if (t.kind === "number") { this.p++; return { kind: "num", value: Number(t.text) }; }
    if (t.kind === "string") { this.p++; return { kind: "str", value: t.text }; }
    if (t.kind === "lparen") {
      this.p++;
      const inner = this.parseOr();
      this.eat("rparen");
      return inner;
    }
    if (t.kind === "ident") {
      if (t.text === "Variable" && this.toks[this.p + 1]?.kind === "lbracket") {
        this.p++;
        this.eat("lbracket");
        const key = this.eat("string");
        this.eat("rbracket");
        return { kind: "var", name: key.text };
      }
      this.p++;
      if (this.cur().kind === "lparen") {
        this.eat("lparen");
        const args: Expr[] = [];
        if (this.cur().kind !== "rparen") {
          args.push(this.parseOr());
          while (this.match("comma")) args.push(this.parseOr());
        }
        this.eat("rparen");
        return { kind: "call", name: t.text, args };
      }
      return { kind: "call", name: t.text, args: [] };
    }
    throw new Error(`parser: unexpected ${t.kind}(${t.text})`);
  }
}

export function parseCond(input: string): Expr | null {
  const s = input.trim();
  if (!s) return null;
  return new CondParser(s).parseExpr();
}

export function parseScript(input: string): Stmt[] {
  const stmts: Stmt[] = [];
  const segments = input
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segments) {
    const once = /^once\s+/i.test(seg);
    const body = once ? seg.replace(/^once\s+/i, "").trim() : seg;
    const toks = lexCond(body);
    if (toks[0]?.kind !== "ident" || toks[1]?.kind !== "lparen") continue;
    const name = toks[0]!.text;
    const parser = new CondParser(body);
    parser.p = 1;
    const args = parser.parseCallArgs();
    stmts.push({ name, args, once });
  }
  return stmts;
}
