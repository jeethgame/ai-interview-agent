---
name: graphify
description: Knowledge graph navigation, symbol briefing, callers, impact analysis, route listing, and contract extraction using graphify. Use this tool FIRST for codebase querying, architecture exploration, impact analysis, and navigation before using file reads or grep.
---

# Graphify Code Intelligence & Navigation Skill

Use this skill as the **primary navigation and query tool** for understanding the codebase architecture, symbol dependencies, call hierarchies, HTTP routes, DTO contracts, and change impact.

## Decision Tree & Commands

| Question / Goal | Command | Description |
|---|---|---|
| Where is X / what is X? | `graphify find "<name>"` | Locate symbols, classes, functions, or files |
| Full briefing on a symbol | `graphify explain "<symbol>"` | Deep dive into symbol definition, callers, callees, dependencies |
| Who calls / uses X? | `graphify callers "<symbol>"` | Trace all consumers, callers, injectors, or handlers |
| What breaks if I change X? | `graphify impact "<symbol>"` | Blast radius analysis across the codebase |
| All HTTP routes | `graphify routes` | List API routes, methods, and handlers |
| DTO fields & contracts | `graphify contract "<TypeName>"` | DTO schema, field mapping, producers & consumers |
| Trace log or error message | `graphify trace "<message>"` | Identify source code line emitting a specific message |
| Multi-symbol orientation | `graphify brief "<sym1>" "<sym2>"` | Context briefing across multiple symbols |
| Project conventions / gotchas | `graphify know "<topic>"` | Verified knowledge and project architecture notes |
| Graph status & health | `graphify stats` / `graphify doctor` | Node/edge statistics and integrity check |
| Rebuild graph | `graphify build` | Re-index workspace after making file changes |

## Usage Rules & Guidelines

1. **Always Graphify First**: Run the appropriate `graphify` command before executing raw greps, file reads, or unstructured directory searches.
2. **Impact Analysis Before Edits**: Before modifying or refactoring any core component, model, or service, run `graphify impact "<symbol>"` to check downstream effects.
3. **Rebuild After Code Changes**: After adding, editing, or deleting files, run `graphify build` to keep `graphify-out/` synchronized.
4. **Invalid Commands**: Do NOT use `graphify query`, `graphify path`, or `graphify update` (they do not exist).
