import { readFileSync, existsSync, statSync } from "node:fs";

export class TokenManager {
  private tokens = new Set<string>();
  private tokenFile: string;
  private lastMtime = 0;

  constructor(tokenFile: string) {
    this.tokenFile = tokenFile;
    this.reloadIfChanged();
  }

  reloadIfChanged(): void {
    if (!existsSync(this.tokenFile)) return;
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
    return token.slice(0, 12);
  }

  list(): string[] {
    this.reloadIfChanged();
    return [...this.tokens];
  }
}
