import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RomDb } from "./rom/RomDb.js";
import { PlayerManager, type PlayerContext } from "./engine/PlayerManager.js";
import { createMcpServer } from "./mcp/server.js";
import { attachWebSocket } from "./web/websocket.js";
import { formatTrace, formatOptions } from "./engine/format.js";
import type { GameContext } from "./engine/context.js";
import type { WorldState } from "./state/WorldState.js";
import type { Engine } from "./engine/Engine.js";
import type { SaveStore } from "./state/SaveStore.js";
import type { RomDb as RomDbType } from "./rom/RomDb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DISCO_DB ?? join(__dirname, "..", "data", "disco.db");
const SAVES_DIR = process.env.DISCO_SAVES ?? join(__dirname, "..", "saves");
const PORT = parseInt(process.env.DISCO_PORT ?? "3000", 10);
const MODE = process.env.DISCO_MODE ?? "both";

async function main() {
  const rom = new RomDb(DB_PATH);
  const players = new PlayerManager(rom, SAVES_DIR);

  if (MODE === "stdio") {
    // stdio mode: single player, no ID needed
    const ctx = players.getOrCreate("stdio");
    const gameCtx: GameContext = { rom, state: ctx.state, registry: ctx.registry, engine: ctx.engine, saves: ctx.saves };
    const mcp = createMcpServer(gameCtx);
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    console.error(`[disco] stdio MCP server ready (db: ${DB_PATH})`);
    return;
  }

  // MCP endpoint — single-player (uses default player for now)
  const defaultCtx = players.getOrCreate("default");
  const mcpGameCtx: GameContext = { rom, state: defaultCtx.state, registry: defaultCtx.registry, engine: defaultCtx.engine, saves: defaultCtx.saves };
  const mcp = createMcpServer(mcpGameCtx);
  const httpTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcp.connect(httpTransport);

  const indexHtml = readFileSync(join(__dirname, "web", "public", "index.html"), "utf-8");

  const httpServer = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";

    // REST API: /api/<tool>  — playerId from header or body
    if (url.startsWith("/api/") && req.method === "POST") {
      const toolName = url.slice(5).split("?")[0]!;
      let body = "";
      for await (const chunk of req) body += chunk;
      const args = body ? JSON.parse(body) : {};

      // playerId from header or body
      const playerId = (req.headers["x-player-id"] as string) || args.playerId || players.newPlayerId();
      delete args.playerId;

      // players/scenes are global — don't create a player just to list them
      const globalTools = new Set(["players", "scenes"]);
      const pctx = globalTools.has(toolName)
        ? null
        : players.getOrCreate(playerId);

      res.setHeader("X-Player-Id", playerId);
      const respond = (text: string) => {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(text);
      };

      try {
        if (!pctx && !globalTools.has(toolName)) {
          respond("Error: no player context");
          return;
        }
        const p = pctx!;
        switch (toolName) {
          case "start": {
            const id = args.sceneId ?? 142;
            p.state.initFromRom(rom.getAllVariableDefs());
            p.state.party.add("kim");
            const result = p.engine.startScene(id);
            const scene = rom.getScene(id);
            respond(`=== SCENE ${id}: ${scene?.title ?? "?"} ===\n` +
              formatTrace(result.trace) + "\n\n=== OPTIONS ===\n" +
              formatOptions(result.options) +
              `\n\n(stopped: ${result.stoppedAt}, steps: ${result.stepsTaken})`);
            return;
          }
          case "play": {
            const result = p.engine.play({
              choices: args.choices,
              autoAdvance: args.autoAdvance ?? true,
              stopAt: args.stopAt,
              maxSteps: args.maxSteps ?? 100,
            });
            respond(formatTrace(result.trace) + "\n\n=== OPTIONS ===\n" +
              formatOptions(result.options) +
              `\n\n(stopped: ${result.stoppedAt}, steps: ${result.stepsTaken}, position: conv ${result.currentConv} dlg ${result.currentDlg})`);
            return;
          }
          case "status": {
            const s = p.engine.getStatus();
            respond(
              `Player: ${playerId}\n` +
              `Scene: ${s.scene} (conv ${s.currentConv}, dlg ${s.currentDlg})\n` +
              `Day ${s.day}, Hour ${s.hour}\nMoney: ${s.money} reál\n` +
              `Party: ${s.party.join(", ") || "alone"}\n` +
              `Inventory: ${s.inventory.join(", ") || "(empty)"}\n` +
              `Volition: ${s.skills.volition.current} (damage ${s.skills.volition.damage})\n` +
              `Endurance: ${s.skills.endurance.current} (damage ${s.skills.endurance.damage})\n` +
              `Reputation: ${Object.entries(s.reputation).map(([k, v]) => `${k}:${v}`).join(", ") || "(none)"}\n` +
              `Active Tasks:\n  ${s.activeTasks.join("\n  ") || "(none)"}`);
            return;
          }
          case "history": {
            const n = args.count ?? 20;
            const recent = p.engine.history.slice(-n);
            respond(formatTrace(recent) || "(no history yet)");
            return;
          }
          case "save": {
            await p.saves.save(args.slot ?? "auto", p.state.snapshot(), args.label ?? "");
            respond(`Saved to slot "${args.slot ?? "auto"}"${args.label ? ` (${args.label})` : ""} (player: ${playerId})`);
            return;
          }
          case "load": {
            const data = await p.saves.load(args.slot ?? "auto");
            if (!data) { respond(`No save found in slot "${args.slot ?? "auto"}"`); return; }
            p.state.restore(data.state);
            respond(`Loaded slot "${args.slot ?? "auto"}" (${data.label})`);
            return;
          }
          case "saves": {
            const saves = await p.saves.list();
            if (!saves.length) { respond("(no saves)"); return; }
            respond(saves.map((s) => `"${s.slot}" — ${s.label} (${s.savedAt})`).join("\n"));
            return;
          }
          case "scenes": {
            const all = rom.getAllScenes();
            let filtered = all;
            if (args.search) {
              const q = String(args.search).toLowerCase();
              filtered = all.filter((s) => s.title?.toLowerCase().includes(q));
            }
            const lim = args.limit ?? 20;
            const results = filtered.slice(0, lim);
            respond(`Showing ${results.length}/${filtered.length} scenes${args.search ? ` matching "${args.search}"` : ""}:\n` +
              results.map((s) => `  [${s.id}] ${s.title}`).join("\n"));
            return;
          }
          case "players": {
            const list = players.list();
            if (!list.length) { respond("(no active players)"); return; }
            respond(list.map((p) => `${p.playerId}: ${p.scene} (last active: ${p.lastActive})`).join("\n"));
            return;
          }
          default:
            respond(`Unknown tool: ${toolName}`);
            return;
        }
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Error: ${(e as Error).message}`);
      }
      return;
    }

    if (url === "/mcp" && (req.method === "POST" || req.method === "GET" || req.method === "DELETE")) {
      await httpTransport.handleRequest(req, res);
      return;
    }
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
      res.end(indexHtml);
      return;
    }
    res.writeHead(404).end("Not found");
  });

  // WebSocket: multi-player observer
  attachWebSocket(httpServer, players);

  // Cleanup idle players every 10 min
  setInterval(() => players.cleanup(), 600_000);

  httpServer.listen(PORT, () => {
    console.log(`[disco] server ready on port ${PORT}`);
    console.log(`  REST API:      http://localhost:${PORT}/api/<tool>`);
    console.log(`  MCP endpoint:  http://localhost:${PORT}/mcp`);
    console.log(`  Observer page: http://localhost:${PORT}/`);
    console.log(`  DB: ${DB_PATH}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
