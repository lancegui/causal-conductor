import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpineStateStore } from '../src/spine/state';

const SID = 'ses_persist_test';

describe('SpineStateStore disk persistence', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spine-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('an approved contract survives into a fresh store at the same dir', () => {
    const first = new SpineStateStore({ dir });
    first.approve(SID, 'Goal: x\nScope: y\nAcceptance check: z', 1000);
    expect(first.canWrite(SID)).toBe(true);

    // Simulate an OpenCode restart: brand-new store, same directory.
    const reloaded = new SpineStateStore({ dir });
    expect(reloaded.canWrite(SID)).toBe(true);
    expect(reloaded.get(SID).contract?.approvedAt).toBe(1000);
  });

  test('verification state survives a reload', () => {
    const first = new SpineStateStore({ dir });
    first.approve(SID, 'Goal: x', 1000);
    first.markVerified(SID);

    const reloaded = new SpineStateStore({ dir });
    expect(reloaded.canFinish(SID)).toBe(true);
  });

  test('reset clears the persisted contract so a reload sees no contract', () => {
    const first = new SpineStateStore({ dir });
    first.approve(SID, 'Goal: x', 1000);
    first.reset(SID);

    const reloaded = new SpineStateStore({ dir });
    expect(reloaded.canWrite(SID)).toBe(false);
  });

  test('delete removes the persisted file', () => {
    const first = new SpineStateStore({ dir });
    first.approve(SID, 'Goal: x', 1000);
    first.delete(SID);

    expect(readdirSync(dir).length).toBe(0);
    const reloaded = new SpineStateStore({ dir });
    expect(reloaded.canWrite(SID)).toBe(false);
  });

  test('with no dir the store stays in-memory only (back-compat)', () => {
    const first = new SpineStateStore();
    first.approve(SID, 'Goal: x', 1000);

    const second = new SpineStateStore();
    expect(second.canWrite(SID)).toBe(false);
  });

  test('a corrupt persisted file is ignored, not fatal', () => {
    const first = new SpineStateStore({ dir });
    first.approve(SID, 'Goal: x', 1000);
    // Corrupt the on-disk file.
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    require('node:fs').writeFileSync(join(dir, files[0]), '{ not json');

    const reloaded = new SpineStateStore({ dir });
    expect(reloaded.canWrite(SID)).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });
});
