// Drives the plugin through OpenCode's actual lifecycle (factory → config →
// chat.message → tool.execute.before / transform / command), exercising the
// index.ts wiring the unit tests skip: command registration, session→agent
// binding, persistence-dir resolution, and re-hydration across a restart.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CausalConductorSpine from '../src/index';

const SID = 'ses_integration';

function userMsg(text: string) {
  return {
    info: { role: 'user', agent: 'orchestrator', sessionID: SID },
    parts: [{ type: 'text', text }],
  };
}
function asstContract() {
  return {
    info: { role: 'assistant', agent: 'orchestrator', sessionID: SID },
    parts: [
      {
        type: 'text',
        text: '<spine_contract>\nGoal: g\nScope: s\nAcceptance check: a\n</spine_contract>',
      },
    ],
  };
}

describe('plugin lifecycle integration', () => {
  let dir: string;
  let prev: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spine-int-'));
    prev = process.env.CAUSAL_CONDUCTOR_SPINE_DIR;
    process.env.CAUSAL_CONDUCTOR_SPINE_DIR = dir;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CAUSAL_CONDUCTOR_SPINE_DIR;
    else process.env.CAUSAL_CONDUCTOR_SPINE_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  async function boot() {
    const h = (await CausalConductorSpine({} as never)) as any;
    await h.config({});
    await h['chat.message']({ sessionID: SID, agent: 'orchestrator' });
    return h;
  }
  const gate = (h: any, tool: string, args: unknown = {}) =>
    h['tool.execute.before']({ tool, sessionID: SID }, { args });
  const approve = (h: any) =>
    h['experimental.chat.messages.transform'](
      { sessionID: SID },
      { messages: [userMsg('do it'), asstContract(), userMsg('approved')] },
    );

  test('blocks write with no contract, allows after approval, persists', async () => {
    const h = await boot();
    await expect(gate(h, 'write')).rejects.toThrow(/Contract spine blocked/);
    await approve(h);
    await expect(gate(h, 'write')).resolves.toBeUndefined();
    expect(readdirSync(dir).length).toBe(1);
  });

  test('a failed (empty) subagent gates the next write until re-dispatch (Fix #8)', async () => {
    const h = await boot();
    await approve(h);
    await expect(gate(h, 'write')).resolves.toBeUndefined();
    // subagent returns nothing → flagged via tool.execute.after wiring
    await h['tool.execute.after'](
      { tool: 'task', sessionID: SID, callID: 'c', args: {} },
      { title: '', output: '', metadata: {} },
    );
    await expect(gate(h, 'write')).rejects.toThrow(/delegated subagent/i);
    await gate(h, 'task'); // re-dispatch clears it
    await expect(gate(h, 'write')).resolves.toBeUndefined();
  });

  test('git branch flows but destructive git is gated, with no contract', async () => {
    const h = await boot();
    await expect(
      gate(h, 'bash', { command: 'git switch -c feat' }),
    ).resolves.toBeUndefined();
    await expect(
      gate(h, 'bash', { command: "Rscript -e 'stopifnot(n > 0)'" }),
    ).resolves.toBeUndefined();
    await expect(
      gate(h, 'bash', { command: 'git reset --hard HEAD~1' }),
    ).rejects.toThrow(/Contract spine blocked/);
  });

  test('approval survives a simulated restart (new factory, same dir)', async () => {
    const h1 = await boot();
    await approve(h1);
    await expect(gate(h1, 'write')).resolves.toBeUndefined();

    const h2 = await boot(); // restart
    await expect(gate(h2, 'write')).resolves.toBeUndefined();

    await h2['command.execute.before'](
      { command: 'spine', sessionID: SID, arguments: 'reset' },
      { parts: [] },
    );
    await expect(gate(h2, 'write')).rejects.toThrow(/Contract spine blocked/);
  });
});
