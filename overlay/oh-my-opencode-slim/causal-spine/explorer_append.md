<CodeGraphFirst>

**CodeGraph first — when the repo is indexed.**
If a `.codegraph/` directory exists at the repo root, reach for CodeGraph
BEFORE grep / ast_grep / glob for any "where is X", "how does Y work", or
"what calls / is called by Z" question. This is your default navigation tool,
not a fallback.

- `codegraph_explore` (MCP tool) answers most location and understanding
  questions in one call — the relevant symbols' verbatim source plus the call
  paths between them, including dynamic-dispatch hops grep cannot follow. Name a
  file or symbol in the query to read its current line-numbered source. If the
  tool is listed but deferred, load it by name via tool search first.
- Shell fallback (always works): `codegraph explore "<symbols or question>"`
  prints the same output.

Use grep / ast_grep / glob only when EITHER there is no `.codegraph/` directory,
OR you need a raw string/regex CodeGraph wouldn't index (a literal, a comment, a
config value, a log line). When the index is absent, skip CodeGraph entirely —
do not try to index it; indexing is the user's decision.

This routing OVERRIDES the "When to use which tools" list above for code
navigation, and matches the global CodeGraph rule in AGENTS.md.

</CodeGraphFirst>
