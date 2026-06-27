import { DatabaseSync } from "node:sqlite";
import type {
  DialogueNode,
  DLink,
  Scene,
  Check,
  Modifier,
  Alternate,
  VariableDef,
  Actor,
} from "../engine/types.js";

export class RomDb {
  private db: DatabaseSync;
  private stmtNode: ReturnType<DatabaseSync["prepare"]>;
  private stmtScene: ReturnType<DatabaseSync["prepare"]>;
  private stmtOutLinks: ReturnType<DatabaseSync["prepare"]>;
  private stmtInLinks: ReturnType<DatabaseSync["prepare"]>;
  private stmtCheck: ReturnType<DatabaseSync["prepare"]>;
  private stmtModifiers: ReturnType<DatabaseSync["prepare"]>;
  private stmtAlts: ReturnType<DatabaseSync["prepare"]>;
  private stmtActor: ReturnType<DatabaseSync["prepare"]>;
  private stmtVarDefs: ReturnType<DatabaseSync["prepare"]>;
  private stmtScenes: ReturnType<DatabaseSync["prepare"]>;

  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    this.stmtNode = this.db.prepare(
      "SELECT * FROM temp_table WHERE conversationid = ? AND id = ? LIMIT 1"
    );
    this.stmtScene = this.db.prepare(
      "SELECT * FROM dialogues WHERE id = ? LIMIT 1"
    );
    this.stmtOutLinks = this.db.prepare(
      "SELECT * FROM dlinks WHERE originconversationid = ? AND origindialogueid = ? ORDER BY priority ASC"
    );
    this.stmtInLinks = this.db.prepare(
      "SELECT * FROM dlinks WHERE destinationconversationid = ? AND destinationdialogueid = ?"
    );
    this.stmtCheck = this.db.prepare(
      "SELECT * FROM checks WHERE conversationid = ? AND dialogueid = ? LIMIT 1"
    );
    this.stmtModifiers = this.db.prepare(
      "SELECT * FROM modifiers WHERE conversationid = ? AND dialogueid = ?"
    );
    this.stmtAlts = this.db.prepare(
      "SELECT * FROM alternates WHERE conversationid = ? AND dialogueid = ?"
    );
    this.stmtActor = this.db.prepare(
      "SELECT * FROM actors WHERE id = ? LIMIT 1"
    );
    this.stmtVarDefs = this.db.prepare("SELECT * FROM variables");
    this.stmtScenes = this.db.prepare("SELECT * FROM dialogues");
  }

  getNode(conversationId: number, dialogueId: number): DialogueNode | undefined {
    return this.stmtNode.get(conversationId, dialogueId) as unknown as DialogueNode | undefined;
  }

  getScene(conversationId: number): Scene | undefined {
    return this.stmtScene.get(conversationId) as unknown as Scene | undefined;
  }

  getOutLinks(conversationId: number, dialogueId: number): DLink[] {
    return this.stmtOutLinks.all(conversationId, dialogueId) as unknown as DLink[];
  }

  getInLinks(conversationId: number, dialogueId: number): DLink[] {
    return this.stmtInLinks.all(conversationId, dialogueId) as unknown as DLink[];
  }

  getCheck(conversationId: number, dialogueId: number): Check | undefined {
    return this.stmtCheck.get(conversationId, dialogueId) as unknown as Check | undefined;
  }

  getModifiers(conversationId: number, dialogueId: number): Modifier[] {
    return this.stmtModifiers.all(conversationId, dialogueId) as unknown as Modifier[];
  }

  getAlternates(conversationId: number, dialogueId: number): Alternate[] {
    return this.stmtAlts.all(conversationId, dialogueId) as unknown as Alternate[];
  }

  getActor(actorId: number): Actor | undefined {
    return this.stmtActor.get(actorId) as unknown as Actor | undefined;
  }

  getAllVariableDefs(): VariableDef[] {
    return this.stmtVarDefs.all() as unknown as VariableDef[];
  }

  getAllScenes(): Scene[] {
    return this.stmtScenes.all() as unknown as Scene[];
  }

  actorName(actorId: number): string {
    if (actorId === 0 || actorId === undefined) return "";
    const a = this.getActor(actorId);
    return a?.name ?? "";
  }

  close(): void {
    this.db.close();
  }
}
