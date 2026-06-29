import { afterEach, describe, expect, test } from 'bun:test';
import { dedupeSkillBodies, normalizeSkillName } from '../src/skill-suppressor';
import type { MessageWithParts } from '../src/types';
import realFixture from './skill-fixture.json';

const KILL = 'CAUSAL_CONDUCTOR_SUPPRESS_SKILLS_DISABLED';

// A completed skill tool part, matching the real OpenCode shape
// (type:tool, tool:skill, state.status:completed, state.input.name, state.output).
function skillPart(name: string, body: string, status = 'completed') {
  return {
    type: 'tool',
    tool: 'skill',
    state: { status, input: { name }, output: body },
  };
}
const BODY = (n: string) =>
  `<skill_content name="${n}">` + 'x'.repeat(4000) + `</skill_content>`;
const msg = (...parts: unknown[]): MessageWithParts =>
  ({ info: { role: 'assistant' }, parts } as unknown as MessageWithParts);
const out = (p: unknown) => (p as { state: { output: string } }).state.output;

afterEach(() => {
  delete process.env[KILL];
});

describe('skill-reload suppressor', () => {
  test('keeps the first body, stubs later re-fires of the same skill', () => {
    const a = skillPart('descriptive-evidence', BODY('descriptive-evidence'));
    const b = skillPart('descriptive-evidence', BODY('descriptive-evidence'));
    const messages = [msg(a), msg(b)];

    const stubbed = dedupeSkillBodies(messages);

    expect(stubbed).toBe(1);
    expect(out(a).length).toBeGreaterThan(3000); // first body kept intact
    expect(out(b)).toContain('already loaded earlier'); // second stubbed
    expect(out(b).length).toBeLessThan(400);
  });

  test('treats plugin-prefixed and bare names as the same skill', () => {
    const a = skillPart('causal-powers:question-framing', BODY('question-framing'));
    const b = skillPart('question-framing', BODY('question-framing'));
    const stubbed = dedupeSkillBodies([msg(a, b)]);
    expect(stubbed).toBe(1);
    expect(out(b)).toContain('already loaded');
  });

  test('different skills are both kept', () => {
    const a = skillPart('question-framing', BODY('question-framing'));
    const b = skillPart('data-contracts', BODY('data-contracts'));
    expect(dedupeSkillBodies([msg(a, b)])).toBe(0);
  });

  test('does NOT stub a non-completed (failed/pending) load — no cache poison', () => {
    const failed = skillPart('data-contracts', '', 'error');
    const real = skillPart('data-contracts', BODY('data-contracts'));
    const stubbed = dedupeSkillBodies([msg(failed), msg(real)]);
    // failed load is ignored entirely, so the real load is the FIRST and kept
    expect(stubbed).toBe(0);
    expect(out(real).length).toBeGreaterThan(3000);
  });

  test('idempotent: a second pass stubs nothing more', () => {
    const a = skillPart('analysis-craft', BODY('analysis-craft'));
    const b = skillPart('analysis-craft', BODY('analysis-craft'));
    const messages = [msg(a, b)];
    expect(dedupeSkillBodies(messages)).toBe(1);
    expect(dedupeSkillBodies(messages)).toBe(0);
  });

  test('compaction-safe: when the first body is gone, the survivor keeps its body', () => {
    // Simulate post-compaction: only the later load survives in the array.
    const survivor = skillPart('result-verification', BODY('result-verification'));
    expect(dedupeSkillBodies([msg(survivor)])).toBe(0);
    expect(out(survivor).length).toBeGreaterThan(3000);
  });

  test('kill-switch disables suppression', () => {
    process.env[KILL] = '1';
    const a = skillPart('analysis-checkpoints', BODY('analysis-checkpoints'));
    const b = skillPart('analysis-checkpoints', BODY('analysis-checkpoints'));
    expect(dedupeSkillBodies([msg(a, b)])).toBe(0);
  });

  test('ignores non-skill parts', () => {
    const text = { type: 'text', text: 'hello' };
    const bash = { type: 'tool', tool: 'bash', state: { status: 'completed', output: 'x'.repeat(5000) } };
    expect(dedupeSkillBodies([msg(text, bash)])).toBe(0);
  });

  test('normalizeSkillName strips prefix and lowercases', () => {
    expect(normalizeSkillName('causal-powers:Descriptive-Evidence')).toBe('descriptive-evidence');
    expect(normalizeSkillName('  question-framing ')).toBe('question-framing');
  });

  test('real session fixture: 26 loads → 13 stubbed (one body kept per distinct skill)', () => {
    // Deep-clone the imported fixture so the test is repeatable.
    const messages = JSON.parse(JSON.stringify(realFixture)) as MessageWithParts[];
    const stubbed = dedupeSkillBodies(messages);
    // 26 total loads, 13 distinct → 13 duplicates stubbed.
    expect(stubbed).toBe(13);

    // Exactly one full body survives per distinct skill name.
    const fullBodies = new Map<string, number>();
    for (const m of messages) {
      for (const p of m.parts as Array<{ tool?: string; state?: { input?: { name?: string }; output?: string } }>) {
        if (p.tool !== 'skill') continue;
        const name = normalizeSkillName(p.state?.input?.name ?? '');
        const isStub = (p.state?.output ?? '').includes('already loaded earlier');
        if (!isStub) fullBodies.set(name, (fullBodies.get(name) ?? 0) + 1);
      }
    }
    expect(fullBodies.size).toBe(13);
    for (const [, count] of fullBodies) expect(count).toBe(1);
  });
});
