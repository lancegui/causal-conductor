import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prompt = readFileSync(
  join(import.meta.dir, '../../overlay/oh-my-opencode-slim/orchestrator.md'),
  'utf8',
);

describe('orchestrator prompt behavior fixes', () => {
  test('keeps contracts checkpoint-sized', () => {
    expect(prompt).toContain('## Contract Sizing');
    expect(prompt).toContain(
      'Do not bundle a git commit, new implementation, and a long live run into one contract',
    );
  });

  test('does not bypass conductor guard failures through specialist lanes', () => {
    expect(prompt).toContain('## Guard And Routing Failures');
    expect(prompt).toContain(
      "Do not route the same edit or command to a specialist lane merely to bypass the conductor's own guard",
    );
  });

  test('verifies diagnostics semantically rather than chasing labels', () => {
    expect(prompt).toContain('Verification is semantic, not just string matching');
    expect(prompt).toContain('Expected diagnostic or limitation');
    expect(prompt).toContain(
      'Do not turn an expected diagnostic or limitation into new implementation work',
    );
  });

  test('does not contain the rejected broad target-repo boundary rule', () => {
    expect(prompt).not.toContain('Flow Boundary');
    expect(prompt).not.toContain('Do not edit target-repo');
    expect(prompt).not.toContain('orchestration-flow task');
  });
});
