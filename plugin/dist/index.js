// src/spine/fingerprint.ts
import { createHash } from "node:crypto";
function normalizeContractText(text) {
  return text.replace(/\r\n?/g, `
`).split(`
`).map((line) => line.trim()).join(`
`).replace(/\n{3,}/g, `

`).trim();
}
function fingerprintContractText(text) {
  return createHash("sha256").update(normalizeContractText(text)).digest("hex");
}
// src/spine/state.ts
function createSpineState() {
  return { verified: false };
}
function canWrite(state) {
  return state.contract !== undefined;
}
function canFinish(state) {
  return state.contract !== undefined && state.verified;
}
function approveContract(state, text, now = Date.now()) {
  const normalizedText = normalizeContractText(text);
  return {
    ...state,
    contract: {
      text: normalizedText,
      fingerprint: fingerprintContractText(normalizedText),
      approvedAt: now
    },
    verified: false
  };
}
function markVerified(state) {
  if (!state.contract) {
    return state;
  }
  return {
    ...state,
    verified: true
  };
}
function resetSpineState() {
  return createSpineState();
}

class SpineStateStore {
  states = new Map;
  get(sessionID) {
    const existing = this.states.get(sessionID);
    if (existing) {
      return existing;
    }
    const state = createSpineState();
    this.states.set(sessionID, state);
    return state;
  }
  approve(sessionID, text, now = Date.now()) {
    const state = approveContract(this.get(sessionID), text, now);
    this.states.set(sessionID, state);
    return state;
  }
  markVerified(sessionID) {
    const state = markVerified(this.get(sessionID));
    this.states.set(sessionID, state);
    return state;
  }
  reset(sessionID) {
    const state = resetSpineState();
    this.states.set(sessionID, state);
    return state;
  }
  delete(sessionID) {
    this.states.delete(sessionID);
  }
  canWrite(sessionID) {
    return canWrite(this.get(sessionID));
  }
  canFinish(sessionID) {
    return canFinish(this.get(sessionID));
  }
}
// src/internal-initiator.ts
var SLIM_INTERNAL_INITIATOR_MARKER = "<!-- SLIM_INTERNAL_INITIATOR -->";
function createInternalAgentTextPart(text) {
  return {
    type: "text",
    text: `${text}
${SLIM_INTERNAL_INITIATOR_MARKER}`
  };
}

// src/spine-hook.ts
var CONTRACT_BLOCK_RE = /<spine_contract>\s*([\s\S]*?)\s*<\/spine_contract>/gi;
var CONTRACT_BLOCK_TEST_RE = /<spine_contract>\s*[\s\S]*?\s*<\/spine_contract>/i;
var VERIFIED_BLOCK_RE = /<spine_verified>\s*passed\s*<\/spine_verified>/i;
var COMMAND_NAME = "spine";
var WRITE_TOOLS = new Set([
  "apply_patch",
  "edit",
  "Edit",
  "write",
  "Write",
  "multi_edit",
  "MultiEdit"
]);
var SHELL_TOOLS = new Set(["bash", "Bash"]);
var MUTATING_SHELL_PATTERNS = [
  /(?:^|[;&|]\s*)(?:rm|mv|cp|mkdir|touch|chmod|chown|ln|tee|dd|truncate)\b/,
  /(?:^|[;&|]\s*)git\s+(?:rm|mv|restore|reset|clean|checkout|switch|commit|merge|cherry-pick|stash)\b/,
  /(?:^|[;&|]\s*)sed\b[^;&|]*\s-i(?:\b|['"])/,
  /(?:^|[;&|]\s*)perl\s+[^;&|]*\s-pi(?:\s|$)/,
  /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|upgrade)\b/,
  /(?:^|[^<>])(?:>>?|&>|2>|1>)\s*\S+/
];
var SPINE_CONTRACT_REMINDER = "<internal_reminder>Contract spine: no approved contract is active. Read, inspect, and ask questions as needed. Before editing files, propose a short <spine_contract> with Goal, Scope, Out of scope, and Acceptance check, then wait for explicit user approval.</internal_reminder>";
var SPINE_IMPLEMENT_REMINDER = "<internal_reminder>Contract spine: an approved contract is active. Keep edits inside that contract. Before claiming completion, verify the work semantically against the contract and emit <spine_verified>passed</spine_verified> only after it passes.</internal_reminder>";
var SPINE_FINISH_REMINDER = "<internal_reminder>Contract spine: the approved contract has been verified. A final response may summarize the outcome, checks, and any remaining risk concisely.</internal_reminder>";
function textParts(message) {
  return message.parts.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text ?? "");
}
function getLastUserMessage(messages) {
  for (let i = messages.length - 1;i >= 0; i--) {
    if (messages[i].info.role === "user") {
      return messages[i];
    }
  }
  return;
}
function getLastUserText(message) {
  return textParts(message).join(`
`);
}
function extractLatestContractTextFromText(text) {
  let latest;
  for (const match of text.matchAll(CONTRACT_BLOCK_RE)) {
    latest = match[1]?.trim();
  }
  return latest;
}
function extractLatestContractText(messages) {
  let latest;
  for (const message of messages) {
    if (message.info.role !== "assistant") {
      continue;
    }
    for (const text of textParts(message)) {
      latest = extractLatestContractTextFromText(text) ?? latest;
    }
  }
  return latest;
}
function hasContractBlock(message) {
  return textParts(message).some((text) => CONTRACT_BLOCK_TEST_RE.test(text));
}
function hasVerificationBlock(message) {
  return textParts(message).some((text) => VERIFIED_BLOCK_RE.test(text));
}
function hasPassedVerificationAfterLatestContract(messages) {
  let latestContractIndex = -1;
  for (let i = 0;i < messages.length; i++) {
    const message = messages[i];
    if (message.info.role === "assistant" && hasContractBlock(message)) {
      latestContractIndex = i;
    }
  }
  if (latestContractIndex === -1) {
    return false;
  }
  for (let i = latestContractIndex + 1;i < messages.length; i++) {
    const message = messages[i];
    if (message.info.role === "assistant" && hasVerificationBlock(message)) {
      return true;
    }
  }
  return false;
}
function normalizeUserText(text) {
  return text.toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ").trim();
}
function classifyUserIntent(text) {
  const normalized = normalizeUserText(text);
  if (!normalized) {
    return "unknown";
  }
  if (/\b(cancel|reset|stop|never mind|nevermind)\b/.test(normalized)) {
    return "cancel";
  }
  const hasRevisionSignal = /\b(but|except|change|revise|modify|instead|add|also|include|remove|different|new requirement)\b/.test(normalized);
  const hasApprovalSignal = /^(y|yes|ok|okay|approved|approve|go ahead|proceed|do it|implement this|ship it|looks good)$/.test(normalized) || /\b(approved|approve|go ahead|proceed|implement this)\b/.test(normalized);
  if (hasRevisionSignal) {
    return "revise";
  }
  if (hasApprovalSignal) {
    return "approve";
  }
  if (normalized.includes("?")) {
    return "question";
  }
  return "unknown";
}
function resolveSessionID(input, message) {
  return input.sessionID ?? message.info.sessionID;
}
function shouldSkipMessage(message) {
  return textParts(message).some((text) => text.includes(SLIM_INTERNAL_INITIATOR_MARKER));
}
function buildReminder(state) {
  if (canFinish(state)) {
    return SPINE_FINISH_REMINDER;
  }
  if (canWrite(state)) {
    return SPINE_IMPLEMENT_REMINDER;
  }
  return SPINE_CONTRACT_REMINDER;
}
function appendReminder(message, reminder) {
  if (message.parts.some((part) => part.text?.includes("Contract spine:"))) {
    return;
  }
  message.parts.push({
    type: "text",
    text: reminder
  });
}
function formatStatus(state) {
  if (!state.contract) {
    return [
      "Contract spine status: no approved contract.",
      "",
      "- Writes: blocked",
      "- Verified: no",
      "- Next step: draft <spine_contract> and get explicit approval."
    ].join(`
`);
  }
  return [
    "Contract spine status: approved contract active.",
    "",
    `- Writes: ${canWrite(state) ? "allowed" : "blocked"}`,
    `- Verified: ${state.verified ? "yes" : "no"}`,
    `- Approved at: ${new Date(state.contract.approvedAt).toISOString()}`,
    `- Fingerprint: ${state.contract.fingerprint.slice(0, 12)}`,
    state.verified ? "- Next step: final response may summarize outcome and checks." : "- Next step: implement inside the contract, then verify."
  ].join(`
`);
}
function formatHelp() {
  return [
    "Contract spine commands:",
    "",
    "- /spine: show current contract status",
    "- /spine status: show current contract status",
    "- /spine reset: clear the approved contract and verification gate",
    "- /spine help: show this help"
  ].join(`
`);
}
function isObviousMutatingShellCommand(command) {
  const normalized = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  return MUTATING_SHELL_PATTERNS.some((pattern) => pattern.test(normalized));
}
function createSpineHook(options = {}) {
  const enabled = options.enabled ?? true;
  const now = options.now ?? Date.now;
  const store = options.store ?? new SpineStateStore;
  const shouldManageSession = options.shouldManageSession ?? ((_sessionID) => true);
  const assistantMessageIDs = new Map;
  const userMessageIDs = new Map;
  const pendingContracts = new Map;
  let shouldHandleCommand = false;
  function hasSessionID(sessionID) {
    return typeof sessionID === "string" && sessionID.length > 0;
  }
  function shouldManage(sessionID) {
    return enabled && hasSessionID(sessionID) && shouldManageSession(sessionID);
  }
  function shouldManageMessage(sessionID, message) {
    if (shouldManage(sessionID)) {
      return true;
    }
    return enabled && typeof sessionID === "string" && sessionID.length > 0 && message.info.agent === "orchestrator";
  }
  function rememberPendingContract(sessionID, text) {
    const contractText = extractLatestContractTextFromText(text);
    if (contractText) {
      pendingContracts.set(sessionID, contractText);
    }
  }
  function rememberPendingContractsFromMessages(sessionID, messages) {
    for (const message of messages) {
      if (message.info.role !== "assistant") {
        continue;
      }
      for (const text of textParts(message)) {
        rememberPendingContract(sessionID, text);
      }
    }
  }
  function approveLatestContract(sessionID, messages) {
    const contractText = (messages ? extractLatestContractText(messages) : undefined) ?? pendingContracts.get(sessionID);
    if (!contractText) {
      return false;
    }
    store.approve(sessionID, contractText, now());
    pendingContracts.delete(sessionID);
    return true;
  }
  function resetSession(sessionID) {
    store.reset(sessionID);
    pendingContracts.delete(sessionID);
  }
  function noteMessageID(registry, sessionID, messageID) {
    let ids = registry.get(sessionID);
    if (!ids) {
      ids = new Set;
      registry.set(sessionID, ids);
    }
    ids.add(messageID);
  }
  return {
    store,
    registerCommand: (opencodeConfig) => {
      if (!enabled) {
        shouldHandleCommand = false;
        return;
      }
      const commandConfig = opencodeConfig.command;
      if (commandConfig?.[COMMAND_NAME]) {
        shouldHandleCommand = false;
        return;
      }
      if (!opencodeConfig.command) {
        opencodeConfig.command = {};
      }
      opencodeConfig.command[COMMAND_NAME] = {
        template: "Show or reset the current contract spine state",
        description: "Inspect or reset the approved contract spine guard"
      };
      shouldHandleCommand = true;
    },
    handleCommandExecuteBefore: async (input, output) => {
      if (input.command !== COMMAND_NAME || !shouldHandleCommand) {
        return;
      }
      output.parts.length = 0;
      const action = input.arguments.trim().toLowerCase();
      if (action === "help") {
        output.parts.push(createInternalAgentTextPart(formatHelp()));
        return;
      }
      if (!input.sessionID) {
        output.parts.push(createInternalAgentTextPart("Contract spine status is unavailable without a session ID."));
        return;
      }
      if (!shouldManage(input.sessionID)) {
        output.parts.push(createInternalAgentTextPart("Contract spine is not active for this session."));
        return;
      }
      if (action === "reset") {
        store.reset(input.sessionID);
        output.parts.push(createInternalAgentTextPart("Contract spine reset. Writes are blocked until a new contract is approved."));
        return;
      }
      if (action && action !== "status") {
        output.parts.push(createInternalAgentTextPart(formatHelp()));
        return;
      }
      output.parts.push(createInternalAgentTextPart(formatStatus(store.get(input.sessionID))));
    },
    "experimental.chat.messages.transform": async (input, output) => {
      if (!enabled) {
        return;
      }
      const lastUserMessage = getLastUserMessage(output.messages);
      if (!lastUserMessage || shouldSkipMessage(lastUserMessage)) {
        return;
      }
      const agent = lastUserMessage.info.agent;
      if (agent && agent !== "orchestrator") {
        return;
      }
      const sessionID = resolveSessionID(input, lastUserMessage);
      const managesMessage = shouldManageMessage(sessionID, lastUserMessage);
      const state = managesMessage && sessionID ? store.get(sessionID) : { verified: false };
      if (managesMessage && sessionID) {
        rememberPendingContractsFromMessages(sessionID, output.messages);
        if (hasPassedVerificationAfterLatestContract(output.messages)) {
          store.markVerified(sessionID);
        }
        const intent = classifyUserIntent(getLastUserText(lastUserMessage));
        if (intent === "cancel") {
          resetSession(sessionID);
        } else if (intent === "revise") {
          resetSession(sessionID);
        } else if (intent === "approve") {
          approveLatestContract(sessionID, output.messages);
        }
      }
      const currentState = managesMessage && sessionID ? store.get(sessionID) : state;
      appendReminder(lastUserMessage, buildReminder(currentState));
    },
    "tool.execute.before": async (input, output) => {
      if (!enabled) {
        return;
      }
      const isWriteTool = WRITE_TOOLS.has(input.tool);
      const command = typeof output.args?.command === "string" ? output.args.command : "";
      const isMutatingShell = SHELL_TOOLS.has(input.tool) && isObviousMutatingShellCommand(command);
      if (!isWriteTool && !isMutatingShell) {
        return;
      }
      const sessionID = input.sessionID;
      if (!hasSessionID(sessionID) || !shouldManage(sessionID)) {
        return;
      }
      if (!store.canWrite(sessionID)) {
        throw new Error(`Contract spine blocked ${input.tool}: draft <spine_contract> and get explicit user approval before editing files.`);
      }
    },
    event: async (input) => {
      if (!enabled) {
        return;
      }
      if (input.event.type === "message.updated") {
        const sessionID = input.event.properties?.sessionID;
        const info = input.event.properties?.info;
        if (!sessionID || !info?.id) {
          return;
        }
        if (info.role === "assistant" && (info.agent === undefined || info.agent === "orchestrator")) {
          noteMessageID(assistantMessageIDs, sessionID, info.id);
        } else if (info.role === "user") {
          noteMessageID(userMessageIDs, sessionID, info.id);
        }
        return;
      }
      if (input.event.type === "message.part.updated") {
        const sessionID = input.event.properties?.sessionID;
        if (!sessionID) {
          return;
        }
        const part = input.event.properties?.part;
        if (part?.type !== "text" || typeof part.text !== "string" || typeof part.messageID !== "string") {
          return;
        }
        const isAssistantPart = assistantMessageIDs.get(sessionID)?.has(part.messageID) === true;
        if (isAssistantPart) {
          rememberPendingContract(sessionID, part.text);
          if (VERIFIED_BLOCK_RE.test(part.text)) {
            store.markVerified(sessionID);
          }
          return;
        }
        const isUserPart = userMessageIDs.get(sessionID)?.has(part.messageID) === true;
        if (isUserPart && pendingContracts.has(sessionID)) {
          const intent = classifyUserIntent(part.text);
          if (intent === "cancel" || intent === "revise") {
            resetSession(sessionID);
          } else if (intent === "approve") {
            approveLatestContract(sessionID);
          }
        }
        return;
      }
      if (input.event.type === "session.deleted") {
        const sessionID = input.event.properties?.info?.id ?? input.event.properties?.sessionID;
        if (!sessionID) {
          return;
        }
        store.delete(sessionID);
        assistantMessageIDs.delete(sessionID);
        userMessageIDs.delete(sessionID);
        pendingContracts.delete(sessionID);
      }
    }
  };
}

// src/index.ts
var GATED_AGENT = process.env.CAUSAL_CONDUCTOR_GATED_AGENT ?? "orchestrator";
var CausalConductorSpine = async () => {
  const sessionAgent = new Map;
  const spine = createSpineHook({
    enabled: true,
    shouldManageSession: (sessionID) => sessionAgent.get(sessionID) === GATED_AGENT
  });
  return {
    config: async (input) => {
      spine.registerCommand(input);
    },
    "chat.message": async (input) => {
      if (input.sessionID && input.agent) {
        sessionAgent.set(input.sessionID, input.agent);
      }
    },
    event: async (input) => {
      await spine.event(input);
    },
    "tool.execute.before": async (input, output) => {
      await spine["tool.execute.before"](input, output);
    },
    "command.execute.before": async (input, output) => {
      await spine.handleCommandExecuteBefore(input, output);
    },
    "experimental.chat.messages.transform": async (input, output) => {
      await spine["experimental.chat.messages.transform"](input, output);
    }
  };
};
var src_default = CausalConductorSpine;
export {
  src_default as default,
  CausalConductorSpine
};
