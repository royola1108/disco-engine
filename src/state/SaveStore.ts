import { promises as fs } from "node:fs";
import { join } from "node:path";
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

  private slotPath(slot: string): string {
    if (typeof slot !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(slot)) {
      throw new RangeError("Invalid save slot: use 1-100 letters, digits, underscores or hyphens");
    }
    return join(this.dir, `${slot}.json`);
  }

  async save(slot: string, state: WorldStateData, currentConv: number, currentDlg: number, label = "", persona: unknown = null): Promise<void> {
    const path = this.slotPath(slot);
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
    await fs.writeFile(path, JSON.stringify(data, null, 2), "utf-8");
  }

  async load(slot: string): Promise<SaveSlot | null> {
    const path = this.slotPath(slot);
    try {
      const raw = await fs.readFile(path, "utf-8");
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
    await fs.unlink(this.slotPath(slot)).catch(() => {});
  }
}
