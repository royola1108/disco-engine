import { readFileSync, writeFileSync, existsSync, statSync, renameSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";

export class TokenManager {
  private tokens = new Set<string>();
  private tokenFile: string;
  private lastMtime = 0;
  private playerKey: Buffer | null = null;

  constructor(tokenFile: string) {
    this.tokenFile = tokenFile;
    this.reloadIfChanged();
  }

  reloadIfChanged(): void {
    if (!existsSync(this.tokenFile)) { this.tokens.clear(); this.lastMtime = 0; return; }
    const mtime = statSync(this.tokenFile).mtimeMs;
    if (mtime === this.lastMtime) return;
    this.lastMtime = mtime;
    this.tokens.clear();
    const raw = readFileSync(this.tokenFile, "utf-8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) this.tokens.add(t);
    }
  }

  valid(token: string): boolean {
    this.reloadIfChanged();
    return this.tokens.has(token);
  }

  playerId(token: string): string {
    if (!this.playerKey) {
      const path = this.tokenFile + ".player-key";
      if (!existsSync(path)) writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
      const key = readFileSync(path);
      if (key.length !== 32) throw new Error("Invalid player ID key");
      this.playerKey = key;
    }
    return createHmac("sha256", this.playerKey).update(token).digest("hex");
  }

  migrateSaves(savesRoot: string): void {
    const tokens = this.list();
    const root = resolve(savesRoot);
    const moves: [string, string][] = [];
    for (const token of tokens) {
      const prefix = token.slice(0, 12);
      const oldPath = resolve(root, prefix);
      if (dirname(oldPath) !== root) {
        const legacyPath = relative(root, oldPath);
        if (legacyPath && legacyPath !== ".." && !legacyPath.startsWith(`..${sep}`) &&
            !isAbsolute(legacyPath) && existsSync(oldPath)) {
          throw new Error("Nested legacy saves require manual migration");
        }
        continue;
      }
      if (!existsSync(oldPath)) continue;
      if (tokens.filter(t => t.slice(0, 12) === prefix).length !== 1) {
        throw new Error("Ambiguous legacy save ownership; migration required");
      }
      const newPath = resolve(root, this.playerId(token));
      if (existsSync(newPath)) throw new Error("Both legacy and new saves exist; migration required");
      moves.push([oldPath, newPath]);
    }
    for (const [oldPath, newPath] of moves) renameSync(oldPath, newPath);
  }

  list(): string[] {
    this.reloadIfChanged();
    return [...this.tokens];
  }
}
