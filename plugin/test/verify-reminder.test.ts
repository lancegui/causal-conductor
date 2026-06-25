import { describe, expect, test } from 'bun:test';
import { SPINE_IMPLEMENT_REMINDER } from '../src/spine-hook';

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
