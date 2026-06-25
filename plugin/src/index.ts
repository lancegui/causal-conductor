// causal-conductor-spine — a standalone OpenCode plugin that adds the
// contract-spine write-gate to oh-my-opencode-slim WITHOUT forking it.
//
// It installs next to stock oh-my-opencode-slim. OpenCode runs every installed
// plugin's `tool.execute.before`, so this plugin's gate fires alongside omo-slim:
// edits and mutating shell commands throw until a <spine_contract> is approved.
//
// The spine machinery (spine/, spine-hook.ts) is ported verbatim from
// oh-my-opencode-slim; this file is the thin host wrapper.

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import { createSpineHook } from './spine-hook';
import { SpineStateStore } from './spine';

// Which agent's sessions to gate. omo-slim's orchestrator is the contract
// owner; its internal name is "orchestrator". (If you rename the orchestrator's
// display name, set CAUSAL_CONDUCTOR_GATED_AGENT to match.)
const GATED_AGENT = process.env.CAUSAL_CONDUCTOR_GATED_AGENT ?? 'orchestrator';

// Where approved-contract state is persisted so a restart/reload does not drop
// it and force re-approval. Defaults to OpenCode's data dir; override with
// CAUSAL_CONDUCTOR_SPINE_DIR.
function resolveSpineDir(): string {
  if (process.env.CAUSAL_CONDUCTOR_SPINE_DIR) {
    return process.env.CAUSAL_CONDUCTOR_SPINE_DIR;
  }
  const dataHome =
    process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(dataHome, 'opencode', 'storage', 'spine');
}

export const CausalConductorSpine: Plugin = async () => {
  // session -> agent, rebuilt from the chat stream (no omo-slim internals).
  const sessionAgent = new Map<string, string>();

  const spine = createSpineHook({
    enabled: true,
    shouldManageSession: (sessionID) =>
      sessionAgent.get(sessionID) === GATED_AGENT,
    store: new SpineStateStore({ dir: resolveSpineDir() }),
  });

  return {
    // Register the /spine status|reset command.
    config: async (input) => {
      spine.registerCommand(input as unknown as Record<string, unknown>);
    },

    // Track which agent owns each session so we only gate the orchestrator.
    'chat.message': async (input) => {
      if (input.sessionID && input.agent) {
        sessionAgent.set(input.sessionID, input.agent);
      }
    },

    // Drive the contract state machine (intent detection, approve/verify).
    event: async (input) => {
      await spine.event(input as Parameters<typeof spine.event>[0]);
    },

    // THE GATE: throws on edit/write/mutating-bash until a contract is approved.
    'tool.execute.before': async (input, output) => {
      await spine['tool.execute.before'](
        input as Parameters<(typeof spine)['tool.execute.before']>[0],
        output as Parameters<(typeof spine)['tool.execute.before']>[1],
      );
    },

    // Handle the /spine command.
    'command.execute.before': async (input, output) => {
      await spine.handleCommandExecuteBefore(
        input as Parameters<typeof spine.handleCommandExecuteBefore>[0],
        output as Parameters<typeof spine.handleCommandExecuteBefore>[1],
      );
    },

    // Inject the contextual contract reminders into the message stream.
    'experimental.chat.messages.transform': async (input, output) => {
      await spine['experimental.chat.messages.transform'](
        input as Parameters<
          (typeof spine)['experimental.chat.messages.transform']
        >[0],
        output as Parameters<
          (typeof spine)['experimental.chat.messages.transform']
        >[1],
      );
    },
  };
};

export default CausalConductorSpine;
