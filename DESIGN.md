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

## Soft contract (the one caveat)

This overlay is **prompt-level only**. The orchestrator is *instructed* to draft a
contract and wait for approval, but stock oh-my-opencode-slim does **not**
structurally block writes before approval. A code-enforced write-gate exists but
lives in a separate fork and is intentionally out of scope here — keeping the
overlay fork-free is the trade.
