#!/usr/bin/env node
// Tiny drift guard: the repo preset TEMPLATE (preset/causal-spine.jsonc) and the
// LIVE omo-slim config (~/.config/opencode/oh-my-opencode-slim.jsonc) must agree
// on each agent's skills / variant / mcps. `model` is intentionally excluded —
// it's per-provider and the user is told to swap it. Run it directly to print a
// report (exit 1 on drift, 0 when in sync or when there is no live config), or
// import { checkPresetSync } from a test.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRESET = 'causal-spine';
const COMPARE_FIELDS = ['skills', 'variant', 'mcps']; // not "model"

function loadPreset(path) {
  const raw = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const cfg = JSON.parse(raw);
  return cfg.presets?.[PRESET] ?? {};
}

function normalize(value) {
  return JSON.stringify(Array.isArray(value) ? [...value].sort() : (value ?? null));
}

export function checkPresetSync() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const repoPath = join(repoRoot, 'preset', `${PRESET}.jsonc`);
  const configHome =
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const livePath = join(configHome, 'opencode', 'oh-my-opencode-slim.jsonc');

  if (!existsSync(livePath)) {
    return { skipped: true, reason: `no live config at ${livePath}`, differences: [] };
  }
  if (!existsSync(repoPath)) {
    return { skipped: false, differences: [`repo preset missing: ${repoPath}`] };
  }

  const repo = loadPreset(repoPath);
  const live = loadPreset(livePath);
  const agents = [...new Set([...Object.keys(repo), ...Object.keys(live)])].sort();

  const differences = [];
  for (const agent of agents) {
    const r = repo[agent];
    const l = live[agent];
    if (!r || !l) {
      differences.push(`${agent}: present in ${r ? 'repo' : 'live'} only`);
      continue;
    }
    for (const field of COMPARE_FIELDS) {
      const rv = normalize(r[field]);
      const lv = normalize(l[field]);
      if (rv !== lv) {
        differences.push(`${agent}.${field}:\n    repo: ${rv}\n    live: ${lv}`);
      }
    }
  }
  return { skipped: false, agents: agents.length, differences };
}

// CLI entry.
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = checkPresetSync();
  if (res.skipped) {
    console.log(`preset-sync: skipped (${res.reason}).`);
    process.exit(0);
  }
  if (res.differences.length) {
    console.error('preset-sync: repo template and live config have DRIFTED:\n');
    for (const d of res.differences) console.error('  DRIFT ' + d);
    console.error(
      `\n${res.differences.length} difference(s). Reconcile preset/causal-spine.jsonc with the live config (or vice versa).`,
    );
    process.exit(1);
  }
  console.log(
    `preset-sync: repo template and live config agree on ${res.agents} agents (skills/variant/mcps). ✓`,
  );
}
