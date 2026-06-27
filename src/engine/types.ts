export interface NodeRef {
  conversationId: number;
  dialogueId: number;
}

export interface DialogueNode {
  id: number;
  title: string | null;
  dialoguetext: string | null;
  actor: number;
  conversant: number;
  conversationid: number;
  difficultypass: number;
  isgroup: number;
  hascheck: number;
  sequence: string | null;
  hasalts: number;
  conditionstring: string | null;
  userscript: string | null;
}

export interface DLink {
  originconversationid: number;
  origindialogueid: number;
  destinationconversationid: number;
  destinationdialogueid: number;
  isconnector: number;
  priority: number;
}

export interface Scene {
  id: number;
  title: string | null;
  description: string | null;
  actor: number;
  conversant: number;
}

export interface Check {
  conversationid: number;
  dialogueid: number;
  isred: number;
  difficulty: number;
  flagname: string | null;
  forced: number;
  skilltype: string | null;
}

export interface Modifier {
  conversationid: number;
  dialogueid: number;
  variable: string;
  modifier: number;
  tooltip: string | null;
}

export interface Alternate {
  conversationid: number;
  dialogueid: number;
  condition: string | null;
  alternateline: string | null;
}

export interface VariableDef {
  id: number;
  name: string;
  initialvalue: string;
  description: string | null;
}

export interface Actor {
  id: number;
  name: string | null;
  description: string | null;
  talkativeness: number;
}

export const START_DIALOGUE_ID = 0;
