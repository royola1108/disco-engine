import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "node:http";
import type { PlayerManager, PlayerContext } from "../engine/PlayerManager.js";
import type { CheckResult } from "../engine/CheckResolver.js";
import type { Option } from "../engine/Engine.js";
import type { Value } from "../engine/ast.js";

interface WsMessage {
  type: "text" | "check" | "options" | "choose" | "scene_end" | "var_change" | "status";
  playerId?: string;
  [key: string]: unknown;
}

interface ClientInfo {
  ws: WebSocket;
  playerId: string | null;
  ctx: PlayerContext | null;
}

export function attachWebSocket(httpServer: Server, players: PlayerManager): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Map<WebSocket, ClientInfo>();

  // Track which players already have event listeners attached
  const watchedPlayers = new Set<string>();

  function attachPlayerEvents(pctx: PlayerContext) {
    if (watchedPlayers.has(pctx.playerId)) return;
    watchedPlayers.add(pctx.playerId);

    const broadcast = (msg: WsMessage) => {
      const data = JSON.stringify({ ...msg, playerId: pctx.playerId });
      for (const [, info] of clients) {
        if (info.playerId === pctx.playerId && info.ws.readyState === WebSocket.OPEN) {
          info.ws.send(data);
        }
      }
    };

    pctx.engine.on("node:text", (actorName: string, text: string) => {
      broadcast({ type: "text", actorName, text });
    });
    pctx.engine.on("check:roll", (result: CheckResult) => {
      broadcast({ type: "check", result });
    });
    pctx.engine.on("options:show", (options: Option[]) => {
      broadcast({ type: "options", options });
    });
    pctx.engine.on("option:choose", (index: number, option: Option) => {
      broadcast({ type: "choose", index, option });
    });
    pctx.engine.on("scene:end", (conv: number) => {
      broadcast({ type: "scene_end", conv });
    });
    pctx.engine.on("var:change", (name: string, oldVal: Value, newVal: Value) => {
      broadcast({ type: "var_change", name, oldVal, newVal });
    });
  }

  function parsePlayerId(req: IncomingMessage): string | null {
    const url = new URL(req.url ?? "/ws", "http://x");
    const p = url.searchParams.get("player");
    return p || null;
  }

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const playerId = parsePlayerId(req);
    let pctx: PlayerContext | null = null;

    if (playerId) {
      pctx = players.getOrCreate(playerId);
      attachPlayerEvents(pctx);
    }

    clients.set(ws, { ws, playerId, ctx: pctx });

    ws.on("close", () => { clients.delete(ws); });

    // Send initial status
    if (pctx) {
      ws.send(JSON.stringify({
        type: "status",
        playerId: pctx.playerId,
        status: pctx.engine.getStatus(),
        history: pctx.engine.history.slice(-50),
      }));
    } else {
      // No player selected — send player list
      const list = players.list();
      ws.send(JSON.stringify({
        type: "status",
        playerId: null,
        status: { scene: "(select a player)", day: 0, hour: 0, money: 0, party: [], inventory: [], skills: { volition: {current:0,damage:0}, endurance: {current:0,damage:0} }, reputation: {}, activeTasks: [] },
        players: list,
      }));
    }
  });

  return wss;
}
