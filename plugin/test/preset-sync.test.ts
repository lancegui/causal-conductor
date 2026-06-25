import { describe, expect, test } from 'bun:test';
// Repo template ↔ live config drift guard. Hermetic-safe: when there is no live
// omo-slim config (CI / a fresh machine) the check reports `skipped` and this
// test passes without asserting anything.
import { checkPresetSync } from '../../scripts/check-preset-sync.mjs';

describe('repo preset ↔ live config sync', () => {
  test('agents agree on skills/variant/mcps', () => {
    const res = checkPresetSync();
    if (res.skipped) return; // no live config to compare against
    // On drift, the message lists each differing agent.field with both values.
    expect(res.differences).toEqual([]);
  });
});
