import { describe, expect, test } from 'bun:test';
import { createSpineHook } from '../src/spine-hook';

const SID = 'sess-sub';
function freshHook() {
  return createSpineHook({
    enabled: true,
    shouldManageSession: (s) => s === SID,
  });
}
const after = (
  h: ReturnType<typeof freshHook>,
  tool: string,
  output: string,
  sessionID = SID,
) =>
  h['tool.execute.after'](
    { tool, sessionID, callID: 'c', args: {} },
    { title: '', output, metadata: {} } as never,
  );
const before = (h: ReturnType<typeof freshHook>, tool: string, args: unknown = {}) =>
  h['tool.execute.before']({ tool, sessionID: SID, callID: 'c' }, { args } as never);

describe('failed-subagent backstop (Fix #8)', () => {
  test('a task that returns empty output blocks the next write', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000); // contract approved → writes normally allowed
    await expect(before(h, 'write')).resolves.toBeUndefined();
    await after(h, 'task', ''); // subagent returned nothing
    await expect(before(h, 'write')).rejects.toThrow(/delegated subagent/i);
  });

  test('whitespace-only output also counts as empty', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000);
    await after(h, 'task', '   \n  ');
    await expect(before(h, 'write')).rejects.toThrow(/delegated subagent/i);
  });

  test('a task with a real result does not block writes', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000);
    await after(h, 'task', 'Built the panel; 3 files changed; tests pass.');
    await expect(before(h, 'write')).resolves.toBeUndefined();
  });

  test('re-dispatching a task clears the block', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000);
    await after(h, 'task', '');
    await expect(before(h, 'write')).rejects.toThrow(/delegated subagent/i);
    await before(h, 'task'); // re-dispatch addresses it
    await expect(before(h, 'write')).resolves.toBeUndefined();
  });

  test('empty result from a non-task tool does not trigger it', async () => {
    const h = freshHook();
    h.store.approve(SID, 'Goal: x', 1000);
    await after(h, 'read', '');
    await expect(before(h, 'write')).resolves.toBeUndefined();
  });

  test('it does not act on unmanaged sessions', async () => {
    const h = freshHook();
    await h['tool.execute.after'](
      { tool: 'task', sessionID: 'other', callID: 'c', args: {} },
      { title: '', output: '', metadata: {} } as never,
    );
    await expect(
      h['tool.execute.before']({ tool: 'write', sessionID: 'other', callID: 'c' }, {
        args: {},
      } as never),
    ).resolves.toBeUndefined();
  });

  test('/spine reset clears a pending subagent failure', async () => {
    const h = freshHook();
    h.registerCommand({}); // arm /spine (the plugin does this via config at startup)
    h.store.approve(SID, 'Goal: x', 1000);
    await after(h, 'task', '');
    await expect(before(h, 'write')).rejects.toThrow(/delegated subagent/i);
    await h.handleCommandExecuteBefore(
      { command: 'spine', sessionID: SID, arguments: 'reset' },
      { parts: [] },
    );
    h.store.approve(SID, 'Goal: x', 2000); // restore canWrite; flag should be gone
    await expect(before(h, 'write')).resolves.toBeUndefined();
  });
});
