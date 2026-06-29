// Explorer-delegation nudge — a SOFT, once-per-segment reminder that pushes the
// orchestrator to route broad discovery (big reads, recursive sweeps, schema
// dumps) through @explorer instead of dumping the raw output into its own
// context. It never blocks a tool; it only injects one reminder per segment
// after the orchestrator has done enough discovery inline.
//
// WHY a nudge and not a gate: the append already states the delegation rule, but
// a prompt rule alone drifts over a long session (the same reason the skill
// suppressor exists). Blocking a read/bash would be too aggressive and would
// break legitimate inline work, so this is advisory only.
//
// DETECTION IS POSITIVE-MATCH ONLY: a bash command counts only if it matches a
// known broad-discovery pattern below. Everything else — `git status`/`diff`/
// `log`, `pwd`, test/build runs, a single targeted `grep`, reading one named
// file with offset/limit — is never counted, so normal work can't trip it.
// Counting happens in tool.execute.before (the only hook that exposes the
// command/args); over-counting a rare denied op is harmless for a soft nudge.

import type { MessagePart, MessageWithParts } from './types';

const KILL = 'CAUSAL_CONDUCTOR_EXPLORER_NUDGE_DISABLED';
const THRESHOLD_ENV = 'CAUSAL_CONDUCTOR_EXPLORER_NUDGE_THRESHOLD';

export function nudgeThreshold(): number {
  const raw = process.env[THRESHOLD_ENV];
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

// Leading-command anchored where possible, so a piped filter (`cat x | grep y`)
// does NOT count — only a sweep that STARTS the command does.
const BROAD_BASH_PATTERNS: RegExp[] = [
  /^\s*find\b/, // find sweeps
  /^\s*tree\b/,
  /^\s*ls\b[^|;&]*\s-\S*R/, // recursive ls (-R / -lR / -Ra …)
  /^\s*e?grep\b[^|;&]*\s-\S*[rR]/, // grep/egrep -r / -R as the leading command
  /^\s*(rg|ag|ack)\b/, // ripgrep / ag / ack — recursive by default
  /\bsqlite_master\b/, // DB schema dump
  /(?:^|["'\s])\.(schema|tables)\b/, // sqlite dot-commands (quoted or standalone,
  //                                    not a filename like data.tables.csv)
];

export function isBroadDiscoveryBash(command: unknown): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return BROAD_BASH_PATTERNS.some((re) => re.test(command));
}

// A full-file read (no offset and no limit) is the broad form of a read; a read
// scoped with offset/limit is targeted and does not count.
export function isFullFileRead(
  tool: string,
  args: Record<string, unknown> | undefined,
): boolean {
  if (tool !== 'read') {
    return false;
  }
  if (!args) {
    return true;
  }
  return args.offset == null && args.limit == null;
}

function nudgeText(ops: number): string {
  return (
    '<system-reminder>\n' +
    `causal-conductor: you've run ${ops}+ broad discovery operations (full-file ` +
    'reads / recursive searches / sweeps) inline this session. Route FURTHER ' +
    'discovery — broad reads, find/grep/rg sweeps, schema dumps — through ' +
    '@explorer so the raw output stays out of your context; act on the ' +
    'compressed map it returns. Targeted ops you already know you need stay ' +
    'inline. (This is a one-time reminder.)\n' +
    '</system-reminder>'
  );
}

type NudgeSession = { ops: number; delivered: boolean };

export type ExplorerNudge = {
  record: (
    sessionID: string,
    tool: string,
    args: Record<string, unknown> | undefined,
  ) => void;
  take: (sessionID: string) => string | null;
  reset: (sessionID: string) => void;
  // exposed for tests
  ops: (sessionID: string) => number;
};

export function createExplorerNudge(): ExplorerNudge {
  // sessionID -> per-segment state. In-memory only (no persistence): this is
  // "what's happened in the current context segment," reset on compaction.
  const sessions = new Map<string, NudgeSession>();

  function get(sessionID: string): NudgeSession {
    let s = sessions.get(sessionID);
    if (!s) {
      s = { ops: 0, delivered: false };
      sessions.set(sessionID, s);
    }
    return s;
  }

  return {
    record(sessionID, tool, args) {
      if (process.env[KILL] || !sessionID) {
        return;
      }
      const command = (args as { command?: unknown } | undefined)?.command;
      const broad =
        (tool === 'bash' && isBroadDiscoveryBash(command)) ||
        isFullFileRead(tool, args);
      if (broad) {
        get(sessionID).ops += 1;
      }
    },

    take(sessionID) {
      if (process.env[KILL] || !sessionID) {
        return null;
      }
      const s = sessions.get(sessionID);
      if (!s || s.delivered || s.ops < nudgeThreshold()) {
        return null;
      }
      s.delivered = true; // once per segment
      return nudgeText(s.ops);
    },

    reset(sessionID) {
      sessions.delete(sessionID);
    },

    ops(sessionID) {
      return sessions.get(sessionID)?.ops ?? 0;
    },
  };
}

// Append a reminder text part to the most recent user message, so it rides into
// the model on this turn (mirrors how the spine injects its reminders).
export function injectNudge(
  messages: MessageWithParts[],
  text: string,
): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.info?.role === 'user' && Array.isArray(m.parts)) {
      m.parts.push({ type: 'text', text } as MessagePart);
      return true;
    }
  }
  return false;
}
