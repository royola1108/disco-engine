import type { PlayResult } from "./Engine.js";

export function formatTrace(trace: PlayResult["trace"]): string {
  const lines: string[] = [];
  for (const e of trace) {
    switch (e.type) {
      case "text":
        lines.push(e.actorName ? `[${e.actorName}] ${e.text}` : e.text ?? "");
        break;
      case "check":
        if (e.check) {
          const c = e.check;
          lines.push(
            `🎲 CHECK: ${c.skill} (difficulty ${c.difficulty}, ${c.isRed ? "RED" : "WHITE"}) — rolled ${c.rolls[0]}+${c.rolls[1]}=${c.rolls[0]! + c.rolls[1]!}, total ${c.total} → ${c.passed ? "SUCCESS ✅" : "FAILURE ❌"}`
          );
          if (c.modifiers.length) {
            lines.push(`   modifiers: ${c.modifiers.map((m) => `${m.value >= 0 ? "+" : ""}${m.value} (${m.tooltip})`).join(", ")}`);
          }
        }
        break;
      case "choose":
        lines.push(`▶ YOU CHOSE [${e.optionIndex}]: ${e.optionText}`);
        break;
      case "scene_end":
        lines.push(`--- SCENE END: ${e.message} ---`);
        break;
      case "variable":
        lines.push(`   ⚙ ${e.variable}: ${e.oldValue} → ${e.newValue}`);
        break;
      case "info":
        lines.push(`(${e.message})`);
        break;
    }
  }
  return lines.join("\n");
}

export function formatOptions(options: PlayResult["options"]): string {
  if (!options.length) return "(no options — scene ended)";
  return options.map((o) => `[${o.index}] ${o.actorName ? `${o.actorName}: ` : ""}${o.text}`).join("\n");
}
