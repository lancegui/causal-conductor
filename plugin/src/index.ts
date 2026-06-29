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
import { dedupeSkillBodies } from './skill-suppressor';
import { createExplorerNudge, injectNudge } from './explorer-nudge';
import type { MessageWithParts } from './types';

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

  // Soft, once-per-segment @explorer delegation nudge (orchestrator only).
  const nudge = createExplorerNudge();
  const isOrchestrator = (sessionID: string | undefined): sessionID is string =>
    typeof sessionID === 'string' &&
    sessionAgent.get(sessionID) === GATED_AGENT;

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

    // Drive the contract state machine (intent detection, approve/verify), and
    // reset the per-segment nudge counter when the session compacts.
    event: async (input) => {
      await spine.event(input as Parameters<typeof spine.event>[0]);
      const ev = (input as { event?: { type?: string; properties?: { sessionID?: string } } })
        .event;
      if (ev?.type && /compact/i.test(ev.type) && ev.properties?.sessionID) {
        nudge.reset(ev.properties.sessionID);
      }
    },

    // THE GATE: throws on edit/write/mutating-bash until a contract is approved.
    // After the gate clears, count broad-discovery ops for the @explorer nudge
    // (orchestrator sessions only; never blocks).
    'tool.execute.before': async (input, output) => {
      await spine['tool.execute.before'](
        input as Parameters<(typeof spine)['tool.execute.before']>[0],
        output as Parameters<(typeof spine)['tool.execute.before']>[1],
      );
      const { tool, sessionID } = input as { tool: string; sessionID?: string };
      if (isOrchestrator(sessionID)) {
        const args = (output as { args?: Record<string, unknown> }).args;
        nudge.record(sessionID, tool, args);
      }
    },

    // Flag a delegated subagent that returned nothing (likely failed) so the
    // next write is gated — a failed subagent can't be silently treated as done.
    'tool.execute.after': async (input, output) => {
      await spine['tool.execute.after'](
        input as Parameters<(typeof spine)['tool.execute.after']>[0],
        output as Parameters<(typeof spine)['tool.execute.after']>[1],
      );
    },

    // Handle the /spine command.
    'command.execute.before': async (input, output) => {
      await spine.handleCommandExecuteBefore(
        input as Parameters<typeof spine.handleCommandExecuteBefore>[0],
        output as Parameters<typeof spine.handleCommandExecuteBefore>[1],
      );
    },

    // Inject the contextual contract reminders into the message stream, then
    // suppress duplicate skill bodies (keep the first, stub later re-fires).
    // Order: spine first (it may append a reminder), then dedupe the array.
    'experimental.chat.messages.transform': async (input, output) => {
      await spine['experimental.chat.messages.transform'](
        input as Parameters<
          (typeof spine)['experimental.chat.messages.transform']
        >[0],
        output as Parameters<
          (typeof spine)['experimental.chat.messages.transform']
        >[1],
      );
      const messages = (output as { messages?: MessageWithParts[] }).messages;
      if (Array.isArray(messages)) {
        const stubbed = dedupeSkillBodies(messages);
        // Opt-in visibility: the DB stores pre-transform bodies, so this log is
        // the only direct evidence the suppressor fired. Set
        // CAUSAL_CONDUCTOR_SUPPRESS_DEBUG=1 to see per-turn stub counts.
        if (stubbed > 0 && process.env.CAUSAL_CONDUCTOR_SUPPRESS_DEBUG) {
          console.error(
            `[causal-conductor] skill-suppressor: stubbed ${stubbed} duplicate skill ${
              stubbed === 1 ? 'body' : 'bodies'
            } this turn`,
          );
        }

        // Once-per-segment @explorer nudge, orchestrator sessions only.
        const sessionID =
          (input as { sessionID?: string }).sessionID ??
          messages.find((m) => m?.info?.role === 'user')?.info?.sessionID;
        if (isOrchestrator(sessionID)) {
          const text = nudge.take(sessionID);
          if (text) {
            injectNudge(messages, text);
            if (process.env.CAUSAL_CONDUCTOR_SUPPRESS_DEBUG) {
              console.error(
                '[causal-conductor] explorer-nudge: injected delegation reminder',
              );
            }
          }
        }
      }
    },
  };
};

export default CausalConductorSpine;
