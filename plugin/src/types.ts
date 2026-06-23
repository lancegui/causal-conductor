// Ported from oh-my-opencode-slim (src/hooks/types.ts). Structural shapes for
// the OpenCode plugin message arrays — optional extras are harmless.

export type MessageInfo = {
  role: string;
  agent?: string;
  sessionID?: string;
  id?: string;
};

export type MessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type MessageWithParts = {
  info: MessageInfo;
  parts: MessagePart[];
};
