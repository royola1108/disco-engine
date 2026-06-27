# Disco Engine — MCP AI 玩极乐迪斯科

一个通用文字游戏引擎，把 Disco Elysium 的完整剧本/规则/状态存成 SQLite ROM，通过 MCP 协议让 AI 自己玩，同时提供浏览器实时观察页。

## 架构

```
ROM (disco.db, 只读)
  ├── temp_table   111166 个对话节点（台词 + conditionstring + userscript）
  ├── dialogues     1428 个场景
  ├── dlinks       134491 条跳转边
  ├── checks         235 个掷骰检查
  ├── modifiers      921 个修正
  ├── alternates    2843 条备选台词
  ├── variables    10513 个全局变量
  └── actors         421 个角色

引擎层
  ├── RomDb          SQLite 封装（node:sqlite 零依赖）
  ├── parser.ts      递归下降 Lexer + Parser（conditionstring + userscript）
  ├── eval.ts        ConditionEvaluator + ScriptRunner + FunctionRegistry
  ├── CheckResolver  2d6 + 技能 + 修正 vs 难度
  ├── Engine         主循环：节点→条件→选项→dlinks→脚本→掷骰→存档
  └── WorldState     variables + inventory + party + time + reputation + skills

适配层
  └── DiscoFunctions  85 个游戏函数注册（IsKimHere/CheckItem/SetVariableValue...）

服务层
  ├── MCP server      disco.start/play/status/history/save/load/scenes（远程 HTTP transport）
  └── WebSocket       实时推送台词/掷骰/选项/变量变化给浏览器观察页
```

## 快速开始

```bash
npm install
npm run demo          # 引擎端到端验证（控制台输出）
npm run play          # 启动完整服务（MCP + 观察页）
```

服务启动后：
- **观察页**: http://localhost:3000/
- **MCP 端点**: http://localhost:3000/mcp

## 连接 AI 玩家

### Claude Desktop / Cursor / 其他 MCP host

在 MCP 配置中添加远程 HTTP server：

```json
{
  "mcpServers": {
    "disco": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### VPS 部署

```bash
# VPS 上
git clone <repo> && cd disco-engine
npm install
# 把 disco.db 放到 data/ 目录
DISCO_PORT=3000 DISCO_MODE=both npm run play

# 用 pm2 守护
pm2 start "npx tsx src/index.ts" --name disco
```

本地 AI host 连远程 MCP：
```json
{ "mcpServers": { "disco": { "url": "https://your-vps:3000/mcp" } } }
```

浏览器开 `https://your-vps:3000/` 实时观察。

## MCP 工具

| 工具 | 说明 |
|------|------|
| `disco.start` | 开始新游戏或跳转到指定场景 |
| `disco.play` | **主循环**：auto-advance 穿过无选项节点，到决策点停下。传 `choices:[N]` 做一个选择后继续 |
| `disco.status` | 当前状态快照（场景/金钱/队伍/任务/技能） |
| `disco.history` | 最近游戏轨迹 |
| `disco.save` / `disco.load` / `disco.saves` | 存档管理 |
| `disco.scenes` | 列出/搜索场景 |

### 游戏循环（AI 视角）

```
disco.start({sceneId: 142})     → 看到开场台词 + 2 个选项
disco.play({choices: [0]})      → 选"试着开锁"，看到后续剧情 + 4 个选项
disco.play({choices: [2]})      → 选"砸门"，看到掷骰结果 + 后续
disco.play({})                  → 不选，继续 auto-advance 到下一个决策点
disco.status()                  → 查看当前状态
disco.save({slot: "ch1"})       → 存档
```

**为什么不是每步都调？** 80% 的节点是 NPC 独白/连接器，不需 AI 决策。`disco.play` 一次调用自动穿过这些，只在真正的选择点停下。一个场景从 20-50 次调用降到 5-10 次。

**为什么一次只选一个？** 极乐迪斯科的选择互相影响——选 A 改变 B 的可见选项。盲选多个会选到不存在的选项。`choices` 传多个只用于已知路径重玩。

## 技术栈

- TypeScript + Node.js 24（`node:sqlite` 内置，零 native 依赖）
- `@modelcontextprotocol/sdk` — MCP server + client
- `ws` — WebSocket 观察页
- `zod` — 工具参数校验

## 通用性

引擎核心不认任何游戏函数。`FunctionRegistry` 是可插拔的——换游戏只需：
1. 准备符合这套表结构的 SQLite ROM
2. 写一个适配层注册该游戏的函数
3. 其余（引擎/解释器/MCP/观察页）原样复用

## 数据来源

- `disco.db` 来自 [msyavuz/disco-api](https://github.com/msyavuz/disco-api)（社区为爱发电整理）
- 仅限本地自用，不可公开分发或商用
