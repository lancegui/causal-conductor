import { describe, expect, test } from 'bun:test';
import { classifyUserIntent } from '../src/spine-hook';

describe('classifyUserIntent (Fix #3)', () => {
  test('plain approvals', () => {
    expect(classifyUserIntent('approve')).toBe('approve');
    expect(classifyUserIntent('approved')).toBe('approve');
    expect(classifyUserIntent('yes')).toBe('approve');
    expect(classifyUserIntent('go ahead')).toBe('approve');
    expect(classifyUserIntent('looks good')).toBe('approve');
  });

  test('approval wins when revision-ish words co-occur', () => {
    expect(classifyUserIntent('approve, but tweak the wording later')).toBe(
      'approve',
    );
    expect(classifyUserIntent('yes, also add a robustness check')).toBe(
      'approve',
    );
    expect(classifyUserIntent('approved — go ahead and also include merges')).toBe(
      'approve',
    );
  });

  test('bare task instructions are NOT revisions (narrowed regex)', () => {
    expect(classifyUserIntent('also add the merged-PR outcome')).toBe('unknown');
    expect(classifyUserIntent('include time-to-merge as well')).toBe('unknown');
    expect(classifyUserIntent('do the event study plot generation')).toBe(
      'unknown',
    );
  });

  test('genuine revisions still classify as revise', () => {
    expect(classifyUserIntent("let's revise the whole design")).toBe('revise');
    expect(classifyUserIntent('rework the approach')).toBe('revise');
    expect(classifyUserIntent('change the scope to repo-month')).toBe('revise');
  });

  test('explicit cancels', () => {
    expect(classifyUserIntent('cancel')).toBe('cancel');
    expect(classifyUserIntent('reset')).toBe('cancel');
    expect(classifyUserIntent('stop')).toBe('cancel');
    expect(classifyUserIntent('never mind')).toBe('cancel');
  });

  test('questions and unknowns', () => {
    expect(classifyUserIntent('what do you think?')).toBe('question');
    expect(classifyUserIntent('where is the plot')).toBe('unknown');
    expect(classifyUserIntent('')).toBe('unknown');
  });
});
