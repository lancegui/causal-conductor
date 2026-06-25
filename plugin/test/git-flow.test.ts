import { describe, expect, test } from 'bun:test';
import { isObviousMutatingShellCommand } from '../src/spine-hook';
import { createSpineHook } from '../src/spine-hook';

describe('git VCS flow is not gated (Fix #5)', () => {
  test('branch creation / switching flows without a contract', () => {
    expect(isObviousMutatingShellCommand('git switch -c my-branch')).toBe(false);
    expect(isObviousMutatingShellCommand('git switch main')).toBe(false);
    expect(isObviousMutatingShellCommand('git checkout -b my-branch')).toBe(
      false,
    );
    expect(isObviousMutatingShellCommand('git checkout main')).toBe(false);
  });

  test('commit / stash / merge / cherry-pick are ungated VCS flow', () => {
    expect(isObviousMutatingShellCommand('git commit -m "wip"')).toBe(false);
    expect(isObviousMutatingShellCommand('git stash')).toBe(false);
    expect(isObviousMutatingShellCommand('git merge feature')).toBe(false);
    expect(isObviousMutatingShellCommand('git cherry-pick abc123')).toBe(false);
    expect(isObviousMutatingShellCommand('git add -A')).toBe(false);
  });

  test('the exact branch command from the session flows', () => {
    const cmd =
      'branch="did-ai"; git status --short --branch; if git rev-parse --verify --quiet "$branch" >/dev/null; then git switch "$branch"; else git switch -c "$branch"; fi';
    expect(isObviousMutatingShellCommand(cmd)).toBe(false);
  });

  test('genuinely destructive git stays gated', () => {
    expect(isObviousMutatingShellCommand('git reset --hard HEAD~1')).toBe(true);
    expect(isObviousMutatingShellCommand('git clean -fd')).toBe(true);
    expect(isObviousMutatingShellCommand('git restore .')).toBe(true);
    expect(isObviousMutatingShellCommand('git checkout -- scripts/run.R')).toBe(
      true,
    );
    expect(isObviousMutatingShellCommand('git checkout .')).toBe(true);
    expect(isObviousMutatingShellCommand('git rm old.R')).toBe(true);
    expect(isObviousMutatingShellCommand('git mv a.R b.R')).toBe(true);
  });

  test('non-git mutations are still gated', () => {
    expect(isObviousMutatingShellCommand('rm -rf build')).toBe(true);
    expect(isObviousMutatingShellCommand('sed -i "s/a/b/" f.R')).toBe(true);
    expect(isObviousMutatingShellCommand('echo x > f.txt')).toBe(true);
    expect(isObviousMutatingShellCommand('Rscript run.R 2> errors.log')).toBe(
      true,
    );
  });

  test('/dev/null and fd-dup redirects are not mutations', () => {
    expect(isObviousMutatingShellCommand('git rev-parse HEAD >/dev/null')).toBe(
      false,
    );
    expect(isObviousMutatingShellCommand('Rscript run.R 2>/dev/null')).toBe(
      false,
    );
    expect(isObviousMutatingShellCommand('Rscript run.R > /dev/null 2>&1')).toBe(
      false,
    );
  });

  test('read-only git is never gated', () => {
    expect(isObviousMutatingShellCommand('git status --short')).toBe(false);
    expect(isObviousMutatingShellCommand('git log --oneline -10')).toBe(false);
    expect(isObviousMutatingShellCommand('git diff --stat')).toBe(false);
  });

  test('end-to-end: git switch -c is allowed with no contract', async () => {
    const SID = 'sess-git';
    const h = createSpineHook({
      enabled: true,
      shouldManageSession: (s) => s === SID,
    });
    expect(h.store.canWrite(SID)).toBe(false);
    await expect(
      h['tool.execute.before'](
        { tool: 'bash', sessionID: SID },
        { args: { command: 'git switch -c feat' } } as never,
      ),
    ).resolves.toBeUndefined();
  });
});
