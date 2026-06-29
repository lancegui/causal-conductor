import { afterEach, describe, expect, test } from 'bun:test';
import {
  createExplorerNudge,
  injectNudge,
  isBroadDiscoveryBash,
  isFullFileRead,
  nudgeThreshold,
} from '../src/explorer-nudge';
import type { MessageWithParts } from '../src/types';

const KILL = 'CAUSAL_CONDUCTOR_EXPLORER_NUDGE_DISABLED';
const THRESH = 'CAUSAL_CONDUCTOR_EXPLORER_NUDGE_THRESHOLD';
const SID = 'sess-1';

afterEach(() => {
  delete process.env[KILL];
  delete process.env[THRESH];
});

describe('broad-discovery bash detection (positive-match only)', () => {
  test('matches sweeps', () => {
    for (const c of [
      'find . -name "*.py"',
      'tree src',
      'ls -R data/',
      'ls -laR .',
      'grep -r "pattern" .',
      'egrep -R foo src',
      'rg "def main"',
      'ag TODO',
      'sqlite3 db ".schema"',
      'sqlite3 db "SELECT * FROM sqlite_master"',
    ]) {
      expect(isBroadDiscoveryBash(c)).toBe(true);
    }
  });

  test('does NOT match normal/targeted ops (inherent allow-list)', () => {
    for (const c of [
      'git status',
      'git diff HEAD',
      'git log --oneline -5',
      'pwd',
      'bun test',
      'pytest tests/',
      'Rscript scripts/run.R',
      'npm run build',
      'cat scripts/foo.R | grep theme', // grep as a filter, not leading
      'grep "known_string" scripts/one_file.R', // targeted grep, no -r
      'ls data/output', // non-recursive ls
      'make',
    ]) {
      expect(isBroadDiscoveryBash(c)).toBe(false);
    }
  });

  test('non-string command is safe', () => {
    expect(isBroadDiscoveryBash(undefined)).toBe(false);
    expect(isBroadDiscoveryBash(123)).toBe(false);
  });
});

describe('full-file read detection', () => {
  test('full read (no offset/limit) counts; scoped read does not', () => {
    expect(isFullFileRead('read', { filePath: 'a.md' })).toBe(true);
    expect(isFullFileRead('read', undefined)).toBe(true);
    expect(isFullFileRead('read', { filePath: 'a.md', offset: 10, limit: 50 })).toBe(false);
    expect(isFullFileRead('read', { filePath: 'a.md', limit: 50 })).toBe(false);
    expect(isFullFileRead('bash', { command: 'find .' })).toBe(false);
  });
});

describe('explorer nudge state machine', () => {
  test('nudges once after threshold broad ops, then never again this segment', () => {
    const n = createExplorerNudge();
    expect(nudgeThreshold()).toBe(5);
    // 4 broad ops — below threshold
    n.record(SID, 'bash', { command: 'find .' });
    n.record(SID, 'read', { filePath: 'a' }); // full read
    n.record(SID, 'bash', { command: 'rg foo' });
    n.record(SID, 'read', { filePath: 'b' });
    expect(n.ops(SID)).toBe(4);
    expect(n.take(SID)).toBeNull();
    // 5th broad op crosses the threshold
    n.record(SID, 'bash', { command: 'ls -R .' });
    expect(n.ops(SID)).toBe(5);
    const text = n.take(SID);
    expect(text).toContain('@explorer');
    expect(text).toContain('one-time');
    // already delivered this segment
    expect(n.take(SID)).toBeNull();
  });

  test('targeted ops do not count toward the threshold', () => {
    const n = createExplorerNudge();
    for (let i = 0; i < 10; i += 1) {
      n.record(SID, 'bash', { command: 'git status' });
      n.record(SID, 'read', { filePath: 'a', offset: 1, limit: 20 }); // scoped
    }
    expect(n.ops(SID)).toBe(0);
    expect(n.take(SID)).toBeNull();
  });

  test('reset (compaction) clears the segment so a fresh nudge can fire', () => {
    const n = createExplorerNudge();
    for (let i = 0; i < 5; i += 1) n.record(SID, 'bash', { command: 'find .' });
    expect(n.take(SID)).not.toBeNull();
    n.reset(SID);
    expect(n.ops(SID)).toBe(0);
    for (let i = 0; i < 5; i += 1) n.record(SID, 'bash', { command: 'find .' });
    expect(n.take(SID)).not.toBeNull(); // nudges again post-compaction
  });

  test('threshold is configurable via env', () => {
    process.env[THRESH] = '2';
    const n = createExplorerNudge();
    n.record(SID, 'bash', { command: 'find .' });
    expect(n.take(SID)).toBeNull();
    n.record(SID, 'bash', { command: 'rg x' });
    expect(n.take(SID)).not.toBeNull();
  });

  test('kill-switch disables counting and nudging', () => {
    process.env[KILL] = '1';
    const n = createExplorerNudge();
    for (let i = 0; i < 10; i += 1) n.record(SID, 'bash', { command: 'find .' });
    expect(n.ops(SID)).toBe(0);
    expect(n.take(SID)).toBeNull();
  });
});

describe('injectNudge', () => {
  const userMsg = (): MessageWithParts =>
    ({ info: { role: 'user' }, parts: [{ type: 'text', text: 'hi' }] } as MessageWithParts);

  test('appends a text part to the last user message', () => {
    const messages = [userMsg(), { info: { role: 'assistant' }, parts: [] } as MessageWithParts, userMsg()];
    expect(injectNudge(messages, 'REMINDER')).toBe(true);
    const last = messages[2];
    expect(last.parts.at(-1)).toEqual({ type: 'text', text: 'REMINDER' });
    expect(messages[0].parts.length).toBe(1); // earlier user msg untouched
  });

  test('returns false when there is no user message', () => {
    const messages = [{ info: { role: 'assistant' }, parts: [] } as MessageWithParts];
    expect(injectNudge(messages, 'REMINDER')).toBe(false);
  });
});
