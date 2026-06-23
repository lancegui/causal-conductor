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

## The contract is enforced (not just prompted)

This package ships the contract **two layers deep**:

1. **Prompt** (`overlay/`) — the orchestrator drafts a `<spine_contract>` and is
   told to wait for your approval.
2. **Plugin** (`plugin/`, `causal-conductor-spine`) — a standalone OpenCode plugin
   that **structurally blocks writes**. Its `tool.execute.before` hook throws on
   any `edit`/`write`/`multi_edit` or mutating `bash` command until a contract is
   approved (`canWrite`), and gates "finish" until verification. It installs
   *next to* stock oh-my-opencode-slim — **no fork** — because OpenCode runs every
   plugin's `tool.execute.before`, so this gate fires alongside omo-slim.

The state machine: **no contract → writes blocked** → you approve → **writes
allowed (scoped)** → `<spine_verified>passed</spine_verified>` → **finish allowed**.

**Soft mode** is still available: skip step 3 of the installer (don't register the
plugin) and you get the prompt-only contract — a strong convention without the
hard gate. Installing the plugin makes it real.

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
  (non-destructive — new files only),
- installs the `causal-spine` preset if you have no `oh-my-opencode-slim.jsonc`
  yet (else prints the merge step), and
- prints the one line to add to your `opencode.jsonc` `plugin` array to enable the
  **enforced contract** (`plugin/` is pre-built — no build tool needed). Skip that
  line for prompt-only / soft mode.

Then edit the model ids in the preset to providers you've authenticated, and
**restart OpenCode** — plugins, prompts, and presets load at session start only.

See [DESIGN.md](DESIGN.md) for why it works this way.

### What goes where

| File | Installs to | Purpose |
|---|---|---|
| `overlay/oh-my-opencode-slim/orchestrator.md` | `~/.config/opencode/oh-my-opencode-slim/orchestrator.md` | Replaces the orchestrator prompt (contract spine + recon-delegation) |
| `overlay/oh-my-opencode-slim/causal-spine/orchestrator_append.md` | same path under `causal-spine/` | Appends the causal lane mapping (preset-scoped) |
| `preset/causal-spine.jsonc` | merge into `oh-my-opencode-slim.jsonc` | Models, skills, MCP wiring for the 5 lanes |
| `plugin/` (pre-built `dist/`) | register its path in `opencode.jsonc` `plugin` array | The enforced contract write-gate (`causal-conductor-spine`) |

The prompt files rely on omo-slim's built-in prompt override (`loadAgentPrompt`):
`{agent}.md` replaces an agent's prompt, `{preset}/{agent}_append.md` appends,
both read from the config dir at runtime — no rebuild. The plugin is a standard
standalone OpenCode plugin loaded next to omo-slim; its gate composes with
omo-slim because OpenCode runs every plugin's `tool.execute.before`.

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
