## graphify

This project has a knowledge graph at graphify-out/. Use graphify as the PRIMARY navigation tool before any grep, Read, or file search.

### Decision tree

| Question | Command |
|---|---|
| Where is X / what is X? | `graphify find "<name>"` |
| Full briefing on a symbol | `graphify explain "<symbol>"` |
| Who calls / uses X? | `graphify callers "<symbol>"` |
| What breaks if I change X? | `graphify impact "<symbol>"` |
| All HTTP routes | `graphify routes` |
| DTO fields + producers/consumers | `graphify contract "<TypeName>"` |
| What code emits this log message? | `graphify trace "<message>"` |
| Orientation on multiple symbols | `graphify brief "<sym1>" "<sym2>"` |
| Project conventions / gotchas | `graphify know "<topic>"` |
| Rebuild after code changes | `graphify build` |

### Rules
- Run the appropriate graphify command FIRST for any codebase question.
- Only fall back to grep/file search if graphify returns nothing useful.
- After modifying or deleting files, run `graphify build` to keep the graph current.
- Read ARCHITECTURE_GRAPH.md only for broad architecture review.
- `graphify query`, `graphify path`, `graphify update` do NOT exist — do not use them.
