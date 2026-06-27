import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { GameContext } from "../engine/context.js";
import type { PlayResult } from "../engine/Engine.js";
import { formatTrace, formatOptions } from "../engine/format.js";

function textResult(text: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text }] };
}

export function createMcpServer(ctx: GameContext): McpServer {
  const mcp = new McpServer(
    { name: "disco-elysium-engine", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  mcp.registerTool(
    "disco.start",
    {
      title: "Start Game",
      description:
        "Start a new game or jump to a specific scene. Initializes world state and plays forward to the first decision point. Returns the opening dialogue trace and available options.",
      inputSchema: {
        sceneId: z
          .number()
          .optional()
          .describe("Conversation/scene ID to start at. If omitted, starts at scene 1 (the first scene)."),
      },
    },
    async ({ sceneId }) => {
      const id = sceneId ?? 1;
      ctx.state.initFromRom(ctx.rom.getAllVariableDefs());
      ctx.state.party.add("kim");
      const result = ctx.engine.startScene(id);
      const scene = ctx.rom.getScene(id);
      const text =
        `=== SCENE ${id}: ${scene?.title ?? "?"} ===\n` +
        `${formatTrace(result.trace)}\n\n` +
        `=== OPTIONS ===\n${formatOptions(result.options)}\n\n` +
        `(stopped: ${result.stoppedAt}, steps: ${result.stepsTaken})`;
      return textResult(text);
    }
  );

  mcp.registerTool(
    "disco.play",
    {
      title: "Play / Advance",
      description:
        "Advance the game. By default, auto-runs through all non-decision nodes (NPC monologues, connectors, narration) and STOPS at the first real decision point — returning the full dialogue trace plus current options. This is the primary loop: call disco.play({}) to read what happens, then disco.play({ choices: [N] }) to pick option N and continue.\n\n" +
        "IMPORTANT: choices in Disco Elysium are interdependent — picking option 2 changes what options appear next. So normally you pass ONE choice at a time, read the result, then decide the next. Do NOT pass multiple choices unless you are intentionally skipping known/repeated dialogue.\n\n" +
        "Usage:\n" +
        "- `disco.play({})` — auto-advance to the next decision point (read NPC dialogue, stop at choices)\n" +
        "- `disco.play({ choices: [2] })` — pick option 2, then auto-advance to the NEXT decision point\n" +
        "- `disco.play({ stopAt: [\"scene_end\"] })` — run until the scene ends (no decisions needed)\n" +
        "- `disco.play({ choices: [1, 0] })` — ONLY use when you know the path (e.g. re-exploring). Picks 1, then 0 at the next fork, auto-advancing between. Blind multi-choice is risky — later options may not exist after earlier ones.",
      inputSchema: {
        choices: z
          .array(z.number())
          .optional()
          .describe("Choice index(es) to make at decision point(s). Normally pass ONE: [2] picks option 2 and stops at the next fork. Pass multiple [2,0,1] ONLY for known paths — each choice changes what comes next, so later picks may be invalid. When empty/exhausted, stops at the next decision point."),
        autoAdvance: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true, automatically follows single-outcome nodes (NPC dialogue, connectors) without stopping. Default true — only decision points (2+ options) trigger a stop."),
        stopAt: z
          .array(z.enum(["no_choices", "check", "scene_end", "max_steps", "choices_exhausted"]))
          .optional()
          .describe("Conditions to stop at. Default: [\"no_choices\", \"check\"] — stop at decision points and dice checks. Use [\"scene_end\"] to run until the scene ends without stopping."),
        maxSteps: z
          .number()
          .optional()
          .default(100)
          .describe("Safety limit on total nodes traversed per call. Default 100."),
      },
    },
    async (args) => {
      const result = ctx.engine.play({
        choices: args.choices,
        autoAdvance: args.autoAdvance ?? true,
        stopAt: args.stopAt as PlayResult["stoppedAt"][] | undefined,
        maxSteps: args.maxSteps ?? 100,
      });
      const text =
        `${formatTrace(result.trace)}\n\n` +
        `=== OPTIONS ===\n${formatOptions(result.options)}\n\n` +
        `(stopped: ${result.stoppedAt}, steps: ${result.stepsTaken}, position: conv ${result.currentConv} dlg ${result.currentDlg})`;
      return textResult(text);
    }
  );

  mcp.registerTool(
    "disco.status",
    {
      title: "Game Status",
      description:
        "Get the current game state snapshot: current scene, day/time, money, party members, inventory, skills (volition/endurance), reputation, and active tasks.",
      inputSchema: {},
    },
    async () => {
      const s = ctx.engine.getStatus();
      const text =
        `Scene: ${s.scene} (conv ${s.currentConv}, dlg ${s.currentDlg})\n` +
        `Day ${s.day}, Hour ${s.hour}\n` +
        `Money: ${s.money} reál\n` +
        `Party: ${s.party.join(", ") || "alone"}\n` +
        `Inventory: ${s.inventory.join(", ") || "(empty)"}\n` +
        `Volition: ${s.skills.volition.current} (damage ${s.skills.volition.damage})\n` +
        `Endurance: ${s.skills.endurance.current} (damage ${s.skills.endurance.damage})\n` +
        `Reputation: ${Object.entries(s.reputation).map(([k, v]) => `${k}:${v}`).join(", ") || "(none)"}\n` +
        `Active Tasks:\n  ${s.activeTasks.join("\n  ") || "(none)"}`;
      return textResult(text);
    }
  );

  mcp.registerTool(
    "disco.history",
    {
      title: "History",
      description: "Get recent game trace entries (dialogue, checks, choices, variable changes).",
      inputSchema: {
        count: z.number().optional().describe("Number of recent entries to retrieve. Default 20."),
      },
    },
    async ({ count }) => {
      const n = count ?? 20;
      const recent = ctx.engine.history.slice(-n);
      return textResult(formatTrace(recent) || "(no history yet)");
    }
  );

  mcp.registerTool(
    "disco.save",
    {
      title: "Save Game",
      description: "Save the current game state to a named slot. The AI's persona/memory is stored separately and not included.",
      inputSchema: {
        slot: z.string().describe("Save slot name, e.g. 'auto' or 'chapter1'."),
        label: z.string().optional().describe("Optional human-readable label."),
      },
    },
    async ({ slot, label }) => {
      await ctx.saves.save(slot, ctx.state.snapshot(), label ?? "");
      return textResult(`Saved to slot "${slot}"${label ? ` (${label})` : ""}`);
    }
  );

  mcp.registerTool(
    "disco.load",
    {
      title: "Load Game",
      description: "Load a saved game state from a named slot. Restores all variables, inventory, party, time, etc.",
      inputSchema: {
        slot: z.string().describe("Save slot name to load."),
      },
    },
    async ({ slot }) => {
      const data = await ctx.saves.load(slot);
      if (!data) return textResult(`No save found in slot "${slot}"`);
      ctx.state.restore(data.state);
      return textResult(`Loaded slot "${slot}" (${data.label})`);
    }
  );

  mcp.registerTool(
    "disco.saves",
    {
      title: "List Saves",
      description: "List all available save slots.",
      inputSchema: {},
    },
    async () => {
      const saves = await ctx.saves.list();
      if (!saves.length) return textResult("(no saves)");
      return textResult(saves.map((s: { slot: string; label: string; savedAt: string }) => `"${s.slot}" — ${s.label} (${s.savedAt})`).join("\n"));
    }
  );

  mcp.registerTool(
    "disco.scenes",
    {
      title: "List Scenes",
      description: "List available scenes/conversations. Use search to filter by title.",
      inputSchema: {
        search: z.string().optional().describe("Search query to filter scene titles."),
        limit: z.number().optional().describe("Max results. Default 20."),
      },
    },
    async ({ search, limit }) => {
      const all = ctx.rom.getAllScenes();
      let filtered = all;
      if (search) {
        const q = search.toLowerCase();
        filtered = all.filter((s) => s.title?.toLowerCase().includes(q));
      }
      const lim = limit ?? 20;
      const results = filtered.slice(0, lim);
      const text =
        `Showing ${results.length}/${filtered.length} scenes${search ? ` matching "${search}"` : ""}:\n` +
        results.map((s: { id: number; title: string | null }) => `  [${s.id}] ${s.title}`).join("\n");
      return textResult(text);
    }
  );

  return mcp;
}

export async function startStdio(ctx: GameContext): Promise<void> {
  const mcp = createMcpServer(ctx);
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

export async function startHttp(
  ctx: GameContext,
  port: number,
  onReady?: () => void
): Promise<void> {
  const mcp = createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);

  const httpServer = createHttpServer(async (req, res) => {
    if (req.url === "/mcp" && (req.method === "POST" || req.method === "GET")) {
      await transport.handleRequest(req, res);
      return;
    }
    res.writeHead(404).end("Not found. Use /mcp for MCP, / for observer page.");
  });

  httpServer.listen(port, () => {
    onReady?.();
  });
}
