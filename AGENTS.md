## Global rules (apply across all projects)

> Cross-project rules and skill availability live in `~/.claude/CLAUDE.md` (read on every session). Skill when‑to‑use lookup: `cat ~/.claude/skills_index.md`. Skills install location: `~/.claude/skills/<name>/` (auto‑loaded everywhere).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ByteBuster-NeuroSyncOS** (2811 symbols, 5739 relationships, 184 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ByteBuster-NeuroSyncOS/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/clusters` | All functional areas |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/processes` | All execution flows |
| `gitnexus://repo/ByteBuster-NeuroSyncOS/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

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
