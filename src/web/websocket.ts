import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { GameContext } from "../engine/context.js";
import type { CheckResult } from "../engine/CheckResolver.js";
import type { Option } from "../engine/Engine.js";
import type { Value } from "../engine/ast.js";

interface WsMessage {
  type: "text" | "check" | "options" | "choose" | "scene_end" | "var_change" | "status";
  [key: string]: unknown;
}

export function attachWebSocket(httpServer: Server, ctx: GameContext): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const broadcast = (msg: WsMessage) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };

  ctx.engine.on("node:text", (actorName: string, text: string) => {
    broadcast({ type: "text", actorName, text });
  });

  ctx.engine.on("check:roll", (result: CheckResult) => {
    broadcast({ type: "check", result });
  });

  ctx.engine.on("options:show", (options: Option[]) => {
    broadcast({ type: "options", options });
  });

  ctx.engine.on("option:choose", (index: number, option: Option) => {
    broadcast({ type: "choose", index, option });
  });

  ctx.engine.on("scene:end", (conv: number) => {
    broadcast({ type: "scene_end", conv });
  });

  ctx.engine.on("var:change", (name: string, oldVal: Value, newVal: Value) => {
    broadcast({ type: "var_change", name, oldVal, newVal });
  });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({
      type: "status",
      status: ctx.engine.getStatus(),
      history: ctx.engine.history.slice(-50),
    }));
  });

  return wss;
}
