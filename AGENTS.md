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

This project is indexed by GitNexus as **ByteBuster-NeuroSyncOS** (4840 symbols, 8081 relationships, 184 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

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

---

## NeuroSync Sovereign OS Core Directives

1. **The "Grit, Not Grime" Philosophy & Safety Assertions**
   - **No Raw Shell Execution:** Never use `shell`, `bash`, or `exec` workflow nodes or subagents (Safety Assertions SA-01 to SA-06). Subagents and workflows must execute natively via strict Node contexts (e.g., `node-pty`) or restricted VMs.
   - **Zero Cloud Reliance:** The OS is a Local AI Operating System. Do not introduce dependencies on cloud subscriptions.

2. **The "Holy Trinity" Architecture Constraints**
   - **Hermes Learning Loop:** Agents generate reusable skills. Context retrieval relies on lightweight embedded SQLite vectors (`sqlite-vec`), NOT bloated context windows.
   - **2nd Brain Paradigm:** Context, memories, API keys, and workflows must be strictly partitioned and isolated by `project_id`.
   - **Deterministic Execution (PortGrid & ScopeLogic):** AI models must NOT execute code directly. They propose DAG workflows to the `dag_proposals` table, which must be reviewed by a Human-In-The-Loop (HITL) before deterministic execution by `CoreExec`.

3. **OpenCode Zen Integration Boundaries**
   - OpenCode Zen's Free Tier is **hard-blocked** server-side for external clients (returning a `FreeTierError` that cannot be bypassed via HTTP headers). 
   - **The Fix:** Do not attempt header injection or origin spoofing. The external agent integration functions perfectly provided the target Workspace is funded (e.g., $5 minimum) and hits paid models (which are sold at-cost).

4. **UI & Module Integrity**
   - **Strict Naming Convention:** Do not alter, simplify, or rebrand the UI module names for "Hobbyist Mode" without explicit instruction. They must exclusively use the agreed-upon technical names: *System View, CoreExec Engine, BaseVault Storage, RouteSwitch LLM, ScopeLogic, PortGrid Skills, ScoutDaemon, Cerebro Memory*.
   - **Live Dashboards:** UI Dashboards must poll from the active SQLite database (`better-sqlite3`) and live daemons. Do not insert offline mock data or UI placeholders.

5. **Code Modification Rules**
   - **No Transient Artifact Edits:** Never edit transpiled build artifacts (e.g., files in `dist/` or `.generated.cjs`). Only edit the origin TypeScript source files.
   - **No Silent Stripping:** When refactoring or updating code, preserve all existing logic, functionality, and comments not directly related to the fix. Do not strip out existing code to save tokens.

## NeuroSync Sovereign OS: The Immutable Axioms & Ultimate Goals

**Status:** The Absolute Source of Truth (Timeless)
**Purpose:** To define the overwhelming, permanent goals of the NeuroSync Operating System and the philosophical boundaries of its architecture.

### Part I: The Immutable Truths (The Ultimate Goals)
1. **Absolute Contextual Permanence (Nothing is Ever Lost):** The OS is the ultimate, infallible memory of every project. Context is eternally preserved and perfectly siloed.
2. **Complete Technological Agnosticism (Immunity to Evolution):** The OS must never be tied to a specific model or protocol. It dynamically routes tasks to the optimal intelligence engine.
3. **Omnipresent, Zero-Friction Synchronization (Bidirectional Flow):** The OS silently pulls changes and actively pushes highly refined context into external environments, eliminating context silos.
4. **Deterministic Reality (The Eradication of Hallucination):** The OS structurally enforces truth through rigorous verification and mathematical boundaries. It prevents AI drift from corrupting reality.
5. **Autonomous Genesis (The Self-Authoring System):** The system must adapt in real-time, autonomously researching and creating new integrations for itself.
6. **Dynamic Environmental Sovereignty (Hardware & OS Polymorphism):** The OS must automatically profile the underlying host system at genesis, discover its CPU, RAM, disk, virtualization, and OS constraints, and dynamically enforce strict performance safeguards on limited hardware while unlocking higher capacities on powerful hardware. It cannot assume a fixed computing envelope.

### Part II: The Lines in the Sand (Module Boundaries)
A module must never cross its boundary.
* **CoreExec (The Engine of Action / Orchestrator):** The domain of Doing and Recovering. It acts; it never plans, thinks, or decides what to do.
* **BaseVault (The Immutable Ledger / Vault):** The domain of Permanence and Truth. It stores and protects data; it never processes logic, runs workflows, or communicates with the outside world.
* **PortGrid (The Human-Machine Bridge / Interface):** The domain of Consent, Visibility, and Control. It requests permission and displays data; it never executes background logic or modifies the system autonomously.
* **ScopeLogic & Cerebro (The Mind / Synthesis & Recall):** The domain of Understanding, Planning, and Relevance. It thinks, plans, and remembers; it never takes real-world action or modifies permanent storage without permission. It only produces "Drafts."
* **RouteSwitch & Heritage Tools (The Universal Translator / Gateway):** The domain of Connection and Abstraction. It routes traffic and translates signals; it never stores memory or executes the user's project logic.
* **ScoutDaemon (The Autonomous Vanguard / Watcher):** The domain of Foresight and Environmental Awareness. It observes and suggests; it never applies changes or interrupts the user's active flow unprompted.

---

## Phase 8 Engineering Patterns (Validated — Never Regress)

### Rule P8-1: ScoutDaemon Module Boundary (CRITICAL)
ScoutDaemon MUST NEVER import or call `executeRun` from `coreexec/engine`.
- **Wrong:** `import { executeRun } from '../coreexec/engine'; executeRun(runId);`
- **Correct:** Write a `pending` status row to `workflow_runs` in BaseVault. CoreExec's `dispatchLoop` 5-second watchdog picks it up organically. Emit a `MAINTENANCE_STAGED` event via `scoutEmitter` for UI feedback.
- **Rationale:** ScoutDaemon is the Watcher. It must never trigger Execution. Violating this collapses the Module Boundary between ScoutDaemon and CoreExec.

### Rule P8-2: Adversarial Verify DAG Nodes
To add a deterministic verification gate between two DAG steps, set the node's `prompt` field to start with the `§VERIFY:` sentinel prefix.
- **Format:** `§VERIFY: key1, key2, key3`
- **Behavior:** The dispatch classifier routes the node to the `verify` worker case, which reads the prior completed task's `output_data` and asserts all listed keys are present and non-null. Zero LLM calls — purely deterministic.
- **On failure:** The node returns a `blocked-by-validation` status, surfacing it in PortGrid for human review. No state propagation on hallucinated output.
- **Never use an LLM to verify LLM output in a single DAG run.** The verify node must be a schema/key check or heuristic script, never another generate call.

### Rule P8-3: chokidar Hardware-Safe Configuration
Any chokidar watcher on this edge node MUST use these exact options:
```ts
chokidar.watch(rootPath, {
  usePolling: false,          // kernel inotify — zero libuv threadpool cost
  awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  depth: 6,                   // cap recursion depth against eMMC pressure
  persistent: false,          // earlyoom-safe: never block process exit
  ignoreInitial: true,        // no burst on startup
  ignored: [/node_modules/, /\.git/, /dist\//, /\.data\//],
});
```
- `usePolling: true` is BANNED — it uses libuv polling threads and WILL saturate `UV_THREADPOOL_SIZE=3`.
- Always debounce change events (≥ 800ms) before triggering any I/O work.
- One watcher per project maximum. Use a registry Map to enforce idempotency.

### Rule P8-4: ProviderCapabilities Declaration Contract
Every new `LLMProvider` adapter MUST declare a `readonly capabilities` block.
- Import `ProviderCapabilities` from `../providers`.
- Declare ALL fields that are known at construction time. Never infer capabilities from the provider ID string.
- `OpenAICompatibleProvider` subclasses inherit `supportsVision: false` and `supportsStructuredOutput: true` by default — override explicitly if the target platform (e.g. Gemini, Claude) supports vision.
- **Example for a vision-capable adapter:**
  ```ts
  readonly capabilities: ProviderCapabilities = {
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStructuredOutput: true,
    contextWindowTokens: 200000,
    inputTypes: ['text', 'image'],
  };
  ```
- ScopeLogic reads `provider.capabilities` before DAG construction to route multimodal tasks. An absent or incorrect capabilities block will silently route vision tasks to a text-only provider, causing runtime failures.

### Rule P8-5: Genesis Hardware Profiler — Module Boundaries
The Genesis Hardware Profiler lives in `ScoutDaemon` as `hardware-profiler.ts`. Module boundary rules:
- **ScoutDaemon** ONLY runs the probe (using `systeminformation`) and writes the result to `BaseVault`'s `hardware_profiles` table. It never applies rules directly.
- **BaseVault** stores the immutable `hardware_profiles` record and the derived `environment_rules` rows. It never reads or enforces them.
- **CoreExec** reads `environment_rules` at boot to inject `UV_THREADPOOL_SIZE`, `max_workers`, and heap limits into all sandboxed process spawns. It never re-runs the profiler.
- **RouteSwitch** reads the `local_llm_enabled` rule flag before attempting local SLM inference. On `constrained` tier, all local model execution is banned.
- **PortGrid** displays the detected hardware tier and rule set to the user during first-run setup and requests signature confirmation for any override.
- The hardware tier classification (`constrained` | `standard` | `high-performance`) is determined once at genesis and stored immutably. Re-profiling requires an explicit user-initiated action via PortGrid — never automatic.
