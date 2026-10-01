## Global rules (apply across all projects)

## Agent Design Workflow
**MANDATORY FOR ALL FURTHER WORK ON THIS PROJECT**
All further work on this project MUST follow the "Agent Design" workflow. You must use separate agents (or subagents) to perform the following steps:
1. **Review and Recommend**: Spawn an agent/subagent to review the current state and make recommendations.
2. **Execute Changes**: Spawn a separate agent/subagent to implement the recommended changes.
3. **Review and Test**: Spawn a third agent/subagent to review the implemented changes and test them.
*Note: Each agent should be initialized with the best model suited for its specific task.*

> Cross-project rules and skill availability live in `~/.claude/CLAUDE.md` (read on every session). Skill when‑to‑use lookup: `cat ~/.claude/skills_index.md`. Skills install location: `~/.claude/skills/<name>/` (auto‑loaded everywhere).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ByteBuster-NeuroSyncOS** (4167 symbols, 8688 relationships, 249 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/clusters` | All functional areas |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/processes` | All execution flows |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Skill Index — Installed Agent Skills

These 22 skills were installed from `~/agent-skills/skills/` into `~/.claude/skills/`. Trigger phrases are drawn directly from each skill's `SKILL.md` frontmatter. See `docs/skill-routing-map.html` for the full delegation graph.

### Workflow & meta

| Skill | Use when |
|-------|----------|
| `incremental-implementation` | Change touches more than one file; deliver in shippable chunks instead of one big drop. |
| `planning-and-task-breakdown` | Spec or requirements exist; need to break work into implementable, parallelizable tasks. |
| `idea-refine` | Idea is still vague; stress-test assumptions before committing to a plan. |
| `interview-me` | Ask is underspecified; user invokes "interview me", "grill me", or "are we sure?". |

### Code quality & review

| Skill | Use when |
|-------|----------|
| `code-review-and-quality` | "review my code", "PR review", "is this ready to merge?" — dispatches to per-axis leaves (security, clarity, scope, tests). |
| `code-simplification` | Refactor for clarity without changing behavior; remove accumulated complexity. |
| `test-driven-development` | Implementing logic, fixing a bug, or changing behavior — drive it with tests. |
| `doubt-driven-development` | Correctness matters more than speed; subject non-trivial decisions to fresh-context adversarial review. |

### API, docs & spec

| Skill | Use when |
|-------|----------|
| `api-and-interface-design` | Designing APIs, module boundaries, GraphQL/REST endpoints, or any public interface contract. |
| `documentation-and-adrs` | Recording architectural decisions, public-API changes, or shipped-feature context for future readers. |
| `spec-driven-development` | New project/feature/change with no spec yet; requirements are unclear or only an idea. |
| `deprecation-and-migration` | Removing old systems or APIs; deciding to maintain or sunset existing code. |

### Frontend & UI engineering

| Skill | Use when |
|-------|----------|
| `frontend-ui-engineering` | Building or modifying user-facing interfaces that need to look production-quality. |
| `browser-testing-with-devtools` | Inspecting DOM, capturing console errors, profiling performance, or verifying visual output in a real browser. |

### Production & ops

| Skill | Use when |
|-------|----------|
| `observability-and-instrumentation` | Adding logging, metrics, tracing, or alerting to make production behavior diagnosable. |
| `performance-optimization` | Performance requirements exist, regressions suspected, or Core Web Vitals need improvement. |
| `ci-cd-and-automation` | Setting up or modifying build/deploy pipelines, quality gates, test runners, or rollout strategy. |
| `shipping-and-launch` | Pre-launch checklist, staged rollout, monitoring, rollback strategy for a production release. |

### Git & context

| Skill | Use when |
|-------|----------|
| `git-workflow-and-versioning` | Making any code change — commits, branching, conflict resolution, parallel streams. |
| `context-engineering` | Starting a new session, output quality degrading, or configuring rules files / project context. |
| `source-driven-development` | Building with a framework/library where correctness matters — cite official docs, no outdated patterns. |
| `security-and-hardening` | Handling user input, authentication, data storage, or third-party integrations; treat external input as hostile. |

### Notes on conflicts

Two skills from `~/agent-skills` were dropped during install because they duplicated critical pre-existing skills:

- `debugging-and-error-recovery` ⊃ same triggers as `systematic-debugging` → kept `systematic-debugging`.
- `using-agent-skills` ⊃ same triggers as `using-superpowers` → kept `using-superpowers`.

If you reach for a missing skill, route through the kept one above.
