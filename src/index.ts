import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGameContext } from "./engine/context.js";
import { createMcpServer } from "./mcp/server.js";
import { attachWebSocket } from "./web/websocket.js";
import { formatTrace, formatOptions } from "./engine/format.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DISCO_DB ?? join(__dirname, "..", "data", "disco.db");
const SAVES_DIR = process.env.DISCO_SAVES ?? join(__dirname, "..", "saves");
const PORT = parseInt(process.env.DISCO_PORT ?? "3000", 10);
const MODE = process.env.DISCO_MODE ?? "both";

async function main() {
  const ctx = createGameContext(DB_PATH, SAVES_DIR);

  if (MODE === "stdio") {
    const mcp = createMcpServer(ctx);
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    console.error(`[disco] stdio MCP server ready (db: ${DB_PATH})`);
    return;
  }

  const mcp = createMcpServer(ctx);
  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(httpTransport);

  const indexHtml = readFileSync(join(__dirname, "web", "public", "index.html"), "utf-8");

  const httpServer = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";

    // REST API for CLI / skill — direct engine calls, no MCP protocol overhead
    if (url.startsWith("/api/") && req.method === "POST") {
      const toolName = url.slice(5);
      let body = "";
      for await (const chunk of req) body += chunk;
      const args = body ? JSON.parse(body) : {};
      const respond = (text: string) => {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(text);
      };
      try {
        switch (toolName) {
          case "start": {
            const id = args.sceneId ?? 1;
            ctx.state.initFromRom(ctx.rom.getAllVariableDefs());
            ctx.state.party.add("kim");
            const result = ctx.engine.startScene(id);
            const scene = ctx.rom.getScene(id);
            respond(`=== SCENE ${id}: ${scene?.title ?? "?"} ===\n` +
              formatTrace(result.trace) + "\n\n=== OPTIONS ===\n" +
              formatOptions(result.options) +
              `\n\n(stopped: ${result.stoppedAt}, steps: ${result.stepsTaken})`);
            return;
          }
          case "play": {
            const result = ctx.engine.play({
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
            const s = ctx.engine.getStatus();
            respond(
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
            const recent = ctx.engine.history.slice(-n);
            respond(formatTrace(recent) || "(no history yet)");
            return;
          }
          case "save": {
            await ctx.saves.save(args.slot ?? "auto", ctx.state.snapshot(), args.label ?? "");
            respond(`Saved to slot "${args.slot ?? "auto"}"${args.label ? ` (${args.label})` : ""}`);
            return;
          }
          case "load": {
            const data = await ctx.saves.load(args.slot ?? "auto");
            if (!data) { respond(`No save found in slot "${args.slot ?? "auto"}"`); return; }
            ctx.state.restore(data.state);
            respond(`Loaded slot "${args.slot ?? "auto"}" (${data.label})`);
            return;
          }
          case "saves": {
            const saves = await ctx.saves.list();
            if (!saves.length) { respond("(no saves)"); return; }
            respond(saves.map((s) => `"${s.slot}" — ${s.label} (${s.savedAt})`).join("\n"));
            return;
          }
          case "scenes": {
            const all = ctx.rom.getAllScenes();
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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(indexHtml);
      return;
    }
    res.writeHead(404).end("Not found");
  });

  attachWebSocket(httpServer, ctx);

  httpServer.listen(PORT, () => {
    console.log(`[disco] server ready on port ${PORT}`);
    console.log(`  MCP endpoint:  http://localhost:${PORT}/mcp`);
    console.log(`  Observer page: http://localhost:${PORT}/`);
    console.log(`  DB: ${DB_PATH}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
