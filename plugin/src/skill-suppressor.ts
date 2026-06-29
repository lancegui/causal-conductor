// Skill-reload suppressor — kills duplicate skill-body re-injection without
// removing any skill or stopping the discipline's per-request "re-fire".
//
// WHY: on OpenCode each `skill` tool call injects the full skill body
// (~3-8k tokens) into context and it stays resident. The causal-powers card
// mandates re-firing the relevant skill on every analytical request — correct
// for rigor — but the body need only be present ONCE. Re-firing
// `descriptive-evidence` twice (observed) re-injects ~15k tokens for nothing.
//
// MECHANISM: `experimental.chat.messages.transform` hands us the mutable message
// array sent to the model each turn. We walk it in order, keep the FIRST full
// body of each skill, and collapse every later duplicate to a one-line stub.
// This is stateless — no load-tracking, no persistence, no compaction event to
// wire: a body that has scrolled out / been compacted simply isn't in the array,
// so the surviving load becomes "first" and keeps its body. Idempotent: re-runs
// each turn and never re-stubs an already-stubbed part.
//
// NOTE ON VERIFICATION: this rewrites the array sent to the model, not the
// persisted `part` row. The DB still stores the original full body; the real
// signal is the assistant's input/cache-read token growth flattening.

import type { MessagePart, MessageWithParts } from './types';

// Kill-switch: set to any non-empty value to disable suppression without
// uninstalling (mirrors the spine's env conventions).
const KILL_SWITCH = 'CAUSAL_CONDUCTOR_SUPPRESS_SKILLS_DISABLED';

// A skill body looks like <skill_content name="...">…</skill_content>. The stub
// reuses the wrapper so the model reads it as the same tool's output, just
// emptied — and the text tells it exactly what to do (re-apply from memory).
function stubOutput(name: string): string {
  return (
    `<skill_content name="${name}">` +
    `[${name} already loaded earlier this session — re-apply it from memory and ` +
    `say so; full body withheld to save context. It reloads automatically after ` +
    `a compaction.]` +
    `</skill_content>`
  );
}

// "causal-powers:descriptive-evidence" and bare "descriptive-evidence" are the
// same skill — strip an optional plugin prefix, lowercase, trim.
export function normalizeSkillName(name: string): string {
  const bare = name.includes(':') ? (name.split(':').pop() ?? name) : name;
  return bare.trim().toLowerCase();
}

type SkillState = {
  status?: string;
  output?: string;
  input?: { name?: string };
  metadata?: { name?: string };
};

function skillState(part: MessagePart): SkillState | undefined {
  if (part.type !== 'tool' || (part as { tool?: string }).tool !== 'skill') {
    return undefined;
  }
  const state = (part as { state?: unknown }).state;
  if (!state || typeof state !== 'object') {
    return undefined;
  }
  const st = state as SkillState;
  // Only a completed load carries a full body worth deduping. A pending/errored
  // call has no body to suppress — leaving it alone also avoids the
  // cache-poisoning failure mode (we never treat a failed load as "loaded").
  if (st.status !== 'completed' || typeof st.output !== 'string') {
    return undefined;
  }
  return st;
}

function skillNameOf(st: SkillState): string | undefined {
  const raw = st.input?.name ?? st.metadata?.name;
  return typeof raw === 'string' && raw.length > 0
    ? normalizeSkillName(raw)
    : undefined;
}

// Walk messages in order; keep the first full body of each skill, stub the rest.
// Returns the count of bodies stubbed this pass (for logging/tests).
export function dedupeSkillBodies(messages: MessageWithParts[]): number {
  if (process.env[KILL_SWITCH]) {
    return 0;
  }
  const seen = new Set<string>();
  let stubbed = 0;

  for (const message of messages) {
    if (!Array.isArray(message?.parts)) {
      continue;
    }
    for (const part of message.parts) {
      const st = skillState(part);
      if (!st) {
        continue;
      }
      const name = skillNameOf(st);
      if (!name) {
        continue;
      }
      if (!seen.has(name)) {
        seen.add(name); // first occurrence keeps its full body
        continue;
      }
      const stub = stubOutput(name);
      // Idempotent: only rewrite a real body, never an existing stub.
      if (st.output && st.output.length > stub.length) {
        st.output = stub;
        stubbed += 1;
      }
    }
  }

  return stubbed;
}
