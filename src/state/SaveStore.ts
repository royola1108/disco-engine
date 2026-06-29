import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import type { WorldStateData } from "./WorldState.js";

export interface SaveSlot {
  slot: string;
  state: WorldStateData;
  currentConv: number;
  currentDlg: number;
  persona: unknown;
  savedAt: string;
  label: string;
}

export class SaveStore {
  constructor(private dir: string) {}

  async save(slot: string, state: WorldStateData, currentConv: number, currentDlg: number, label = "", persona: unknown = null): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const data: SaveSlot = {
      slot,
      state,
      currentConv,
      currentDlg,
      persona,
      savedAt: new Date().toISOString(),
      label,
    };
    const path = join(this.dir, `${slot}.json`);
    await fs.writeFile(path, JSON.stringify(data, null, 2), "utf-8");
  }

  async load(slot: string): Promise<SaveSlot | null> {
    try {
      const raw = await fs.readFile(join(this.dir, `${slot}.json`), "utf-8");
      return JSON.parse(raw) as SaveSlot;
    } catch {
      return null;
    }
  }

  async list(): Promise<{ slot: string; label: string; savedAt: string }[]> {
    try {
      const files = await fs.readdir(this.dir);
      const slots: { slot: string; label: string; savedAt: string }[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const raw = await fs.readFile(join(this.dir, f), "utf-8");
        const d = JSON.parse(raw) as SaveSlot;
        slots.push({ slot: d.slot, label: d.label, savedAt: d.savedAt });
      }
      return slots.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
      return [];
    }
  }

  async delete(slot: string): Promise<void> {
    await fs.unlink(join(this.dir, `${slot}.json`)).catch(() => {});
  }
}
