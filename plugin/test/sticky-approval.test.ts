import { describe, expect, test } from 'bun:test';
import { createSpineHook } from '../src/spine-hook';
import type { MessageWithParts } from '../src/types';

const SID = 'sess-sticky';
function freshHook() {
  return createSpineHook({
    enabled: true,
    shouldManageSession: (sessionID) => sessionID === SID,
  });
}

function userMsg(text: string): MessageWithParts {
  return {
    info: { role: 'user', agent: 'orchestrator', sessionID: SID },
    parts: [{ type: 'text', text }],
  };
}

async function lastTurn(
  h: ReturnType<typeof freshHook>,
  messages: MessageWithParts[],
) {
  await h['experimental.chat.messages.transform'](
    { sessionID: SID },
    { messages },
  );
}

describe('sticky approval (Fix #2)', () => {
  test('a revise-style follow-up does NOT clear an approved contract', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x\nScope: y\nAcceptance check: z', 1000);
    expect(h.store.canWrite(SID)).toBe(true);

    // A normal mid-task instruction that the old classifier flagged as "revise".
    await lastTurn(h, [userMsg('also add a leave-one-repo-out robustness check')]);

    expect(h.store.canWrite(SID)).toBe(true);
  });

  test('an explicit cancel DOES clear the contract', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000);
    expect(h.store.canWrite(SID)).toBe(true);

    await lastTurn(h, [userMsg('cancel')]);

    expect(h.store.canWrite(SID)).toBe(false);
  });

  test('approval persists across several non-approval turns', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000);

    await lastTurn(h, [userMsg('can this go faster')]);
    await lastTurn(h, [userMsg('this is a great idea')]);
    await lastTurn(h, [userMsg('also include the merged-PR outcome')]);

    expect(h.store.canWrite(SID)).toBe(true);
  });
});
