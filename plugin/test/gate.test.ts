import { describe, expect, test } from 'bun:test';
import { createSpineHook } from '../src/spine-hook';

// Gate only this session in the tests.
const SID = 'sess-test';
function freshHook() {
  return createSpineHook({
    enabled: true,
    shouldManageSession: (sessionID) => sessionID === SID,
  });
}
const gate = (h: ReturnType<typeof freshHook>, tool: string, args: unknown = {}) =>
  h['tool.execute.before']({ tool, sessionID: SID }, { args } as never);

describe('contract-spine write-gate', () => {
  test('blocks edit when no contract is approved', async () => {
    const h = freshHook();
    expect(h.store.canWrite(SID)).toBe(false);
    await expect(gate(h, 'edit')).rejects.toThrow(/Contract spine blocked/);
  });

  test('allows edit after a contract is approved', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x\nScope: y\nAcceptance check: z', 1000);
    expect(h.store.canWrite(SID)).toBe(true);
    await expect(gate(h, 'edit')).resolves.toBeUndefined();
  });

  test('blocks mutating bash, allows read-only tools', async () => {
    const h = freshHook();
    await expect(gate(h, 'bash', { command: 'rm -rf build' })).rejects.toThrow(
      /Contract spine blocked/,
    );
    // non-write tool is never gated
    await expect(gate(h, 'read')).resolves.toBeUndefined();
  });

  test('does not gate sessions it does not manage', async () => {
    const h = freshHook();
    await expect(
      h['tool.execute.before']({ tool: 'edit', sessionID: 'other' }, {
        args: {},
      } as never),
    ).resolves.toBeUndefined();
  });
});
