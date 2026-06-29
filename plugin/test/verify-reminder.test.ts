import { describe, expect, test } from 'bun:test';
import { SPINE_IMPLEMENT_REMINDER, SPINE_CONTRACT_REMINDER } from '../src/spine-hook';

describe('implement reminder requires confirming deliverables exist (Fix #7)', () => {
  test('the reminder tells the model to confirm named deliverables exist on disk', () => {
    const r = SPINE_IMPLEMENT_REMINDER.toLowerCase();
    // It must demand evidence the deliverables are actually present, not just a
    // semantic self-assessment — the 18:17 false-verify named PDFs that didn't
    // exist yet.
    expect(r).toContain('deliverable');
    expect(r).toContain('exist');
    expect(r).toContain('disk');
  });

  test('it still gates the <spine_verified> emission on passing', () => {
    expect(SPINE_IMPLEMENT_REMINDER).toContain('<spine_verified>passed</spine_verified>');
  });

  test('it treats diagnostic/status words as semantic evidence, not automatic blockers', () => {
    const r = SPINE_IMPLEMENT_REMINDER.toLowerCase();
    expect(r).toContain('fail');
    expect(r).toContain('skipped');
    expect(r).toContain('diagnostic');
    expect(r).toContain('expected diagnostic');
    expect(r).toContain('known limitation');
  });
});

describe('verified emission also gates on a validity check, not just a clean run (Fix: reliability != validity)', () => {
  test('the implement reminder distinguishes reliability from validity', () => {
    const r = SPINE_IMPLEMENT_REMINDER.toLowerCase();
    expect(r).toContain('reliability');
    expect(r).toContain('validity');
  });

  test('it requires a plausibility/validity check (run or waived) before <spine_verified>', () => {
    const r = SPINE_IMPLEMENT_REMINDER.toLowerCase();
    expect(r).toContain('plausibility');
    expect(r).toContain('waived');
    // names at least one concrete validity probe so the check is actionable
    expect(r).toContain('benchmark');
  });

  test('the contract reminder asks for a Plausibility threats field on numbers', () => {
    const r = SPINE_CONTRACT_REMINDER.toLowerCase();
    expect(r).toContain('plausibility threats');
    expect(r).toContain('validity check');
  });
});
