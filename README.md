# causal-conductor

An econometrics-flavored orchestration overlay for
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim).

It turns the omo-slim orchestrator into a **contract-first, delegation-by-default
causal-analysis conductor**: it gathers context by dispatching recon agents
*before* it writes a plan, routes verification of your numbers to an independent
reviewer, and runs robustness specs in parallel — instead of doing everything
itself in one expensive context.

It is a thin **config overlay**: a few prompt + preset files dropped into your
OpenCode config directory. It does **not** fork or vendor omo-slim — you keep
installing stock omo-slim and getting its upstream updates.

## Why

A capable orchestrator model, left to its own devices, just does the whole job
itself: reads every script, runs the analysis, and reviews its own output. That
wastes the orchestrator's context window on discovery, and — worse for
econometrics — means **nobody independent ever checks the numbers**.

causal-conductor changes the default path:

1. **Recon before the contract.** Before drafting a plan, the orchestrator
   dispatches **@explorer** (your data schema + current code) and **@librarian**
   (prior work + literature) in parallel, and builds the contract from what they
   return. It only reads a file inline when it's a single named file it's about
   to edit.
2. **Route the numbers to review.** Estimates go to **@oracle** for
   `result-verification` / `analysis-review` / `wrong-number-debugging` — totals
   reconciled to source, joins and leakage checked, magnitudes and identification
   sanity-checked. A clean run is not a correct number.
3. **Parallel robustness.** Bounded execution and robustness/placebo/subsample
   specs go to **@fixer**, one per spec, then get reconciled.
4. **Visible contract spine.** The orchestrator still drafts a `<spine_contract>`,
   waits for your approval, and verifies against it before finishing — delegation
   stays in the open, never a hidden background swarm.

## ⚠️ Soft contract, not a hard write-gate

This overlay is **prompt-level only.** The orchestrator is *instructed* to present
a contract and wait for approval, but stock omo-slim does **not** structurally
block writes before you approve. Treat the contract as a strong convention, not an
enforced gate. (A hard, code-enforced write-gate exists but lives in a separate
fork; it is intentionally not part of this overlay.)

## Requirements

- **OpenCode** with **[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)** installed.
- **[causal-powers](https://github.com/lancegui/causal-powers)** skills installed —
  the preset references its skill names (`question-framing`, `result-verification`,
  `analysis-review`, …). Without it those skills silently no-op.
- Provider auth for the models in the preset (defaults: a flagship orchestrator +
  an independent reviewer model). Swap them for providers you have.

## Install

```sh
git clone https://github.com/lancegui/causal-conductor
cd causal-conductor
./install.sh
```

`install.sh`:
- copies the prompt overlay into `~/.config/opencode/oh-my-opencode-slim/`
  (non-destructive — new files only), and
- if you have **no** `oh-my-opencode-slim.jsonc` yet, installs the `causal-spine`
  preset for you (one-command setup). If you already have one, it's left
  untouched and the merge step is printed (safe JSONC auto-merge isn't attempted).

Then edit the model ids in the preset to providers you've authenticated, and
**restart OpenCode** — prompts and presets load at session start only.

See [DESIGN.md](DESIGN.md) for why it works this way.

### What goes where

| File | Installs to | Purpose |
|---|---|---|
| `overlay/oh-my-opencode-slim/orchestrator.md` | `~/.config/opencode/oh-my-opencode-slim/orchestrator.md` | Replaces the orchestrator prompt (contract spine + recon-delegation) |
| `overlay/oh-my-opencode-slim/causal-spine/orchestrator_append.md` | same path under `causal-spine/` | Appends the causal lane mapping (preset-scoped) |
| `preset/causal-spine.jsonc` | merge into `oh-my-opencode-slim.jsonc` | Models, skills, MCP wiring for the 5 lanes |

These rely on omo-slim's built-in prompt override (`loadAgentPrompt`):
`{agent}.md` replaces an agent's prompt, `{preset}/{agent}_append.md` appends,
both read from the config dir at runtime — no rebuild.

## How it works (the lanes)

| Lane | Model role | Job in this preset |
|---|---|---|
| **orchestrator** | flagship | Contract, routing, reconciliation, final synthesis |
| **@explorer** | fast/cheap | Map data schema + current code/pipeline |
| **@librarian** | fast/cheap + web | Prior work, literature, method/package docs |
| **@oracle** | strong, read-only | Verify the numbers; review identification |
| **@fixer** | fast | Bounded execution; parallel robustness specs |

## Credits

Built on top of [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)
by alvinunreal (MIT). The `orchestrator.md` prompt is derived from omo-slim's
orchestrator prompt. See [NOTICE](NOTICE).

## License

MIT — see [LICENSE](LICENSE).
