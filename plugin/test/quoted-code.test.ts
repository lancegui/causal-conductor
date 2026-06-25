import { describe, expect, test } from 'bun:test';
import { isObviousMutatingShellCommand } from '../src/spine-hook';

describe('redirect/verb detection ignores quoted code (Fix #6)', () => {
  test('a `>` comparison inside R code is not a redirect', () => {
    expect(
      isObviousMutatingShellCommand("Rscript -e 'print(info$size > 0)'"),
    ).toBe(false);
    expect(
      isObviousMutatingShellCommand("Rscript -e 'd <- a[a$e >= 1, ]'"),
    ).toBe(false);
  });

  test('the exact read-only inspection commands from the session flow', () => {
    const checkPlots =
      "Rscript -e 'paths <- c(\"figures/x.pdf\"); info <- file.info(paths); print(all(info$size > 0))'";
    const compareCsv =
      "Rscript -e 'm <- read.csv(\"a.csv\"); d <- merge(m[m$e>=1,], t); print(nrow(d))'";
    expect(isObviousMutatingShellCommand(checkPlots)).toBe(false);
    expect(isObviousMutatingShellCommand(compareCsv)).toBe(false);
  });

  test('a verb name inside a quoted string is not a command', () => {
    expect(isObviousMutatingShellCommand("echo 'rm -rf everything'")).toBe(
      false,
    );
    expect(isObviousMutatingShellCommand('grep "git reset" notes.txt')).toBe(
      false,
    );
  });

  test('a real redirect OUTSIDE quotes is still gated', () => {
    expect(isObviousMutatingShellCommand("Rscript run.R > out.log")).toBe(true);
    expect(
      isObviousMutatingShellCommand("Rscript -e 'cat(1)' > result.txt"),
    ).toBe(true);
  });

  test('a real mutating verb OUTSIDE quotes is still gated', () => {
    expect(isObviousMutatingShellCommand("rm -rf build && echo 'done'")).toBe(
      true,
    );
  });
});
