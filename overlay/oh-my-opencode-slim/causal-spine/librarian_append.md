<CodeGraphForLocalCode>

**Split your tools by target: local code vs. the outside world.**

- **This repository's own code** — "where is X", "how does Y work", "what calls
  Z" about the project you're in: use **CodeGraph first** when a `.codegraph/`
  directory exists at the repo root. `codegraph_explore` (MCP tool) returns the
  relevant symbols' verbatim source plus the call paths between them, including
  dynamic-dispatch hops grep can't follow; name a file or symbol to read its
  current line-numbered source. If the tool is listed but deferred, load it by
  name via tool search. Shell fallback (always works):
  `codegraph explore "<symbols or question>"`. If there is no `.codegraph/`,
  fall back to grep/glob — do not index it yourself.

- **External repositories, libraries, and documentation** — prior work, package
  internals, API references, open-source examples, best practices: keep using
  context7 (official docs), gh_grep (GitHub), and websearch. CodeGraph only
  indexes the local repo, so it does NOT replace these for outside research.

In short: reach for the outside-world tools for outside-world questions, and for
CodeGraph (not gh_grep/websearch) when the question is about the code in THIS
repo. This matches the global CodeGraph rule in AGENTS.md.

</CodeGraphForLocalCode>
