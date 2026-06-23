# Design notes

## The problem this fixes

A capable orchestrator model, told that delegation is optional, just does the
whole job itself — it reads every script, runs the analysis, switches branches,
and reviews its own output. Specialist agents (`@explorer`, `@oracle`, …) never
fire. For econometrics that's doubly bad: the orchestrator's context window is
spent on discovery, and **no independent agent ever checks the numbers**.

The trigger is prompt-level. An orchestrator prompt that says "you may implement
directly," "delegation is optional," and "do not behave like a hidden conductor"
reads, to a strong model, as *"don't delegate"* — the path of least resistance is
to do it inline. "May delegate" means "won't delegate."

## The fix

Make **delegated recon the default path of the planning phase**, while keeping the
contract visible:

1. **Recon before the contract.** `@explorer` (local code/data) and `@librarian`
   (external/literature) fan out in parallel *before* the contract is drafted; the
   contract is built from what they return. Inline reads only for a single named
   file about to be edited (trivia opt-out).
2. **Route the numbers to review.** Estimates go to `@oracle` for
   `result-verification` / `analysis-review` / `wrong-number-debugging`.
3. **Parallel robustness.** Bounded execution and robustness specs go to `@fixer`,
   one per spec.
4. **Visible spine.** The orchestrator still drafts a `<spine_contract>`, waits for
   approval, and verifies against it — delegation stays in the open.

## Why an overlay, not a fork

The whole customization is expressible as **config-dir files** thanks to
oh-my-opencode-slim's built-in prompt override (`loadAgentPrompt`): `{agent}.md`
replaces an agent's prompt, `{preset}/{agent}_append.md` appends, both read at
runtime — no rebuild, no source fork. So:

- `overlay/oh-my-opencode-slim/orchestrator.md` — the contract-spine +
  recon-delegation prompt (rendered from a patched orchestrator, designer/UI
  lanes stripped).
- `overlay/oh-my-opencode-slim/causal-spine/orchestrator_append.md` — the causal
  lane mapping, scoped to the preset.
- `preset/causal-spine.jsonc` — models, skills (incl. `executing-analysis-plans`),
  MCP wiring for the five lanes.

Users install **stock** oh-my-opencode-slim and keep its upstream updates; this
overlay sits on top.

## Enforcement without a fork

The prompt alone is a *soft* contract — the orchestrator is told to wait, but a
prompt can't physically block a write. The hard guarantee lives in a small state
machine + a hook:

- **State machine** (`plugin/src/spine/`): `SpineState = { contract?, verified }`.
  `canWrite` is false until a contract is approved; `canFinish` is false until
  verification. Approval stamps the contract text with a `fingerprint` (drift
  detection) and a timestamp.
- **Gate** (`plugin/src/spine-hook.ts`, `tool.execute.before`): intercepts every
  `edit`/`write`/`multi_edit` and mutating `bash`, and **throws** when
  `!canWrite` — the write cannot execute.

This used to require forking omo-slim (the gate is compiled code, not a config
file). It doesn't anymore: the gate is a **standalone OpenCode plugin** shipped in
`plugin/` and installed next to stock omo-slim. OpenCode runs *every* plugin's
`tool.execute.before`, so the gate fires even though omo-slim itself has no spine.
The plugin is parameterized by `shouldManageSession`, so it gates only the
orchestrator session — identity it rebuilds from the `chat.message` stream, with
no access to omo-slim internals.

Soft mode remains a valid choice: skip installing the plugin and you get the
prompt-only contract.
