---
title: "UI Context"
status: current
owner: "williamdeldaymarketing"
last_updated: "2026-06-26"
review_cadence: "weekly"
source_of_truth: true
---

# UI Context

## Theme

The visual language of NeuroSync Sovereign OS is **dark-themed, technical, and clean**. It balances high functional density (dashboard layout) with operational clarity. The UI is workspace-centric, optimizing space for the Directed Acyclic Graph (DAG) canvas alongside sidecars for chat, run history, and configuration.

**Implementation Details (confirmed in source):**
- **Tailwind CSS 3.4 + PostCSS:** Core styling via local `@tailwindcss` (`^3.4.1`) and `postcss`. CDN script injection is explicitly prohibited — it breaks Vite compilation.
- **Glassmorphism Aesthetic ("Grit, Not Grime"):** Dashboards (`UnifiedMasterDashboard`, `CoreExecDashboard`, `RouteSwitchDashboard`, `CerebroDashboard`) apply premium CSS glassmorphism (`glass-panel` class), glowing borders, branded colors — CoreExec cyan, RouteSwitch amber, Cerebro neural-blue.
- **Brand Logos:** Subproject branding uses explicit `.png` logos from `/public/` and `/Logos/`. Confirmed: `PORTGRIDLogo.png` (`import portGridLogo from '../../Logos/PORTGRIDLogo.png'` in `App.tsx`). Do not substitute generic SVG icons.
- **Light/Dark Mode:** Both modes are implemented. Default respects `window.matchMedia('(prefers-color-scheme: dark)')`. Toggle is in the nav bar via `ThemeToggle` / `ThemeContext`.

---

## Design Principles

- **Functional density over decoration:** Visual real estate is optimized for logs, charts, SSE event streams, and DAG node status.
- **System status visibility:** DB connectivity, active run status, model routing parameters, and governor quota are always visible (via `Statusline`, `AgentKPIStrip`, `GovernorUI`).
- **Destructive confirmation:** Deletion, credential overwrite, or paid-mode authorization requires explicit user confirmation.
- **Dynamic Escalation Rendering:** Blocked workflows and HIGH-severity DAG rejections are surfaced via `NotificationCenter` by consuming `TODO_ESCALATED` / `os_todos` state events. Resolution inputs must reuse existing widget components.
- **Live streaming:** Task and run status updates arrive via SSE (`EventSource` at `http://localhost:3743/api/scout/events`, event name `'scout-update'`). The canvas updates node status in real time without polling.

---

## Confidence & Validation Badges

Raw float confidence values are never shown to users. Scores map to **Local Proof Badges**:

| Badge | Confidence | Color | Usage |
| --- | --- | --- | --- |
| **Gold (Verified)** | ≥ 95% | Gold | Successful milestones, high-trust outputs |
| **Amber (Review Advised)** | 80–94% | Amber | Warnings, draft-only proposals, manual checks |
| **Red (Manual Review Required)** | < 80% | Red | Critical errors, destructive actions, blocked API calls |
| **Gray (Unknown)** | Insufficient data | Gray | No reliable score available |

**Council Mode Confidence (actual implementation in `council.ts`):**
- `'High'`: `maxDiff ≤ 0.2`
- `'Medium'`: `0.2 < maxDiff ≤ 0.5`
- `'Low'`: `maxDiff > 0.5` (or only 1 provider responded)

**`blocked-by-validation` Status:** Rendered as `'error'` state (amber ⛔ badge in `RunHistory.tsx`) — it is not a clean idle state. `NodeOutputInspector` and `ApprovalCockpit` surface resolution paths (LLM_RETRY_OR_FIX → NotificationCenter).

---

## Color Tokens

All components must use semantic tokens. Do not hardcode hex values in feature code.

| Role | CSS Variable | Light Value | Dark Value | Usage |
| --- | --- | --- | --- | --- |
| Page background | `--bg-base` | `#ffffff` | `#09090b` | App root background |
| Surface | `--bg-surface` | `#f4f4f5` | `#18181b` | Cards/panels |
| Elevated surface | — | `#ffffff` | `#27272a` | Modals/popovers |
| Primary text | `--text-primary` | `#09090b` | `#fafafa` | Main readable text |
| Muted text | `--text-muted` | `#71717a` | `#a1a1aa` | Secondary labels |
| Primary accent | `--accent-primary` | `#2563eb` | `#3b82f6` | Primary actions |
| Secondary accent | `--accent-secondary` | `#059669` | `#10b981` | Secondary highlights |
| Border | `--border-default` | `#e4e4e7` | `#27272a` | Dividers and cards |
| Error | `--state-error` | `#dc2626` | `#ef4444` | Errors/destructive |
| Warning | `--state-warning` | `#d97706` | `#f59e0b` | Warnings |
| Success | `--state-success` | `#059669` | `#10b981` | Positive states |
| Info | `--state-info` | `#2563eb` | `#3b82f6` | Neutral notices |

**Glass Panel (confirmed used in `App.tsx` top nav):** `glass-panel` CSS class applies glassmorphism. CSS variables `--primary-glow`, `--bg-glass`, `--border-glass`, `--bg-dots`, `--accent`, `--text-main`, `--text-muted` are used in component inline styles.

---

## Typography

| Role | Font | Variable | Weight | Usage |
| --- | --- | --- | --- | --- |
| UI text | Inter | `--font-sans` | 400, 500, 600 | Main interface |
| Display | Outfit | `--font-display` | 600, 700 | Hero/large headings |
| Code/mono | JetBrains Mono | `--font-mono` | 400 | Code, IDs, logs, task output |

---

## Spacing Scale

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Tight inline gaps |
| `--space-2` | `8px` | Small component padding |
| `--space-3` | `12px` | Default internal spacing |
| `--space-4` | `16px` | Section spacing |
| `--space-6` | `24px` | Major layout spacing |

---

## Border Radius

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-sm` | `4px` | Inputs, chips |
| `--radius-md` | `8px` | Cards, buttons |
| `--radius-lg` | `12px` | Panels |
| `--radius-xl` | `16px` | Modals |

---

## Component Library

- **Icons:** Lucide React — `Cpu`, `Database`, `Network`, `Sun`, `Moon`, `Settings` (confirmed in `App.tsx`). Size: `16px` (UI) or `18–20px` (headers).
- **DAG Canvas:** `@xyflow/react` — `ReactFlow`, `Controls`, `Background` (Dots variant), `Handle`, custom node type `'custom'`.
- **Component location:** `src/ui/components/`
- **Views location:** `src/ui/views/`

---

## Confirmed Component Inventory

### Components (`src/ui/components/`)
| Component | File | Key Behavior |
| --- | --- | --- |
| `ApprovalCockpit` | `ApprovalCockpit.tsx` | Approve/Reject buttons for pending DAG proposals |
| `AgentKPIStrip` | `AgentKPIStrip.tsx` | Live KPI metrics via `/api/system/metrics` SSE |
| `AutonomyDials` | `AutonomyDials.tsx` | Autonomy level configuration dials |
| `CerebroHealthWidget` | `CerebroHealthWidget.tsx` | Polls `/api/cerebro/health` 10s; memory count + staleness status |
| `CronSummary` | `CronSummary.tsx` | Polls `/api/scheduler/jobs`; next tick display |
| `GovernorUI` | `GovernorUI.tsx` | Governor quota + `maxWorkers` throttle controls |
| `IntentPreview` | `IntentPreview.tsx` | DAG proposal intent preview panel |
| `LearningApprovalsQueue` | `LearningApprovalsQueue.tsx` | Cerebro learning approval queue |
| `NodeOutputInspector` | `NodeOutputInspector.tsx` | Task output viewer; retry/edit-rerun actions; refresh fetch |
| `NotificationCenter` | `NotificationCenter.tsx` | `os_todos` escalation surface; `TODO_ESCALATED` event consumer |
| `ProjectManager` | `ProjectManager.tsx` | Project workspace CRUD |
| `RouteSwitchConfig` | `RouteSwitchConfig.tsx` | Provider type + config form (`llama-cpp`, `openai-compatible`, `mock`) |
| `RoutingDials` | `RoutingDials.tsx` | Routing priority controls (`speed/cost/intelligence`) |
| `RunHistory` | `RunHistory.tsx` | Run list (polls `/api/basevault/runs`); handles `blocked-by-validation` (amber ⛔); `onSelectRun` callback |
| `ScopeLogicChat` | `ScopeLogicChat.tsx` | Interview chat → `onProposal(DAGProposalPayload)` callback |
| `SettingsModal` | `SettingsModal.tsx` | Settings overlay with multiple configuration panels |
| `Statusline` | `Statusline.tsx` | Live run status bar in top nav |
| `ThemeContext` | `ThemeContext.tsx` | React context for light/dark theme |
| `ThemeToggle` | `ThemeToggle.tsx` | Sun/Moon toggle button |

### Views (`src/ui/views/`)
| View | File | Purpose |
| --- | --- | --- |
| `UnifiedMasterDashboard` | `UnifiedMasterDashboard.tsx` | KPI strip + 2×2 grid: Action Center, CoreExec+Governor, Cerebro Health, Cron Summary, Exec Ledger |
| `BaseVaultDashboard` | `BaseVaultDashboard.tsx` | SQLite schema viewer, run history display |
| `CerebroDashboard` | `CerebroDashboard.tsx` | Memory management, learning approvals |
| `CoreExecDashboard` | `CoreExecDashboard.tsx` | DAG execution monitoring |
| `RouteSwitchDashboard` | `RouteSwitchDashboard.tsx` | Provider config, 24h usage poll (5s), cost estimate display |
| `ScopeLogicDashboard` | `ScopeLogicDashboard.tsx` | Interview session + proposal management |
| `ScoutDaemonDashboard` | `ScoutDaemonDashboard.tsx` | ScoutDaemon event stream view |

---

## DAG Canvas Node Status Colors

Node status values (set via `data.status`) and their visual meanings:

| Status | CSS class | Visual |
| --- | --- | --- |
| `completed` | `status-completed` | Green/success |
| `running` | `status-running` | Blue/animated |
| `pending` | `status-pending` | Gray/neutral |
| `error` / `parked` / `failed` | `status-error` | Red/warning |

Run history status map (`RunHistory.tsx`):
- `'blocked-by-validation'` → Amber ⛔ (not failed; blocked before execution)
- `'completed'` → Green ✅
- `'failed'` → Red ❌
- `'running'` → Blue ⟳
- `'pending'` → Gray ⏳

---

## Layout Patterns

| Pattern | Description | Responsive Rule |
| --- | --- | --- |
| Main app shell | Top nav bar (glass-panel) + full canvas area | Full viewport; `100vw × 100vh` |
| Left sidebar | Absolute-positioned chat panel (`ScopeLogicChat`) | z-index 10, top-left of canvas |
| Right sidebar | Absolute-positioned run history (`RunHistory`) | z-index 10, top-right of canvas |
| Modals | Centered dialog overlay with focus trap (`SettingsModal`) | Full-width on mobile |
| Dashboards | Tab or section-separated views | Stack vertically on narrow viewports |

---

## Accessibility Requirements

- All interactive elements must be keyboard reachable.
- Focus states must be visible.
- Form errors must be programmatically associated with fields.
- Color must not be the only status indicator (use icons + badges alongside color).
- Modal focus must be trapped and restored.
- Loading and error states must be announced where appropriate.
- `aria-label` required on icon-only buttons (confirmed: `SettingsModal` button has `aria-label="Settings"`, theme toggle has `aria-label="Toggle Theme"`).

---

## Empty, Loading, and Error States

| State | Required Behavior |
| --- | --- |
| Empty | Explain what is missing and provide the next action. |
| Loading | Show progress where duration may exceed perceived instant response. |
| Error | State what failed, what is preserved, and how to recover. |
| Permission denied | Explain access state without leaking sensitive resource details. |
| Blocked workflow | Render as `'error'` state in RunHistory; surface resolution path via NotificationCenter. |

---

## SSE Integration (UI)

The canvas subscribes to `http://localhost:3743/api/scout/events` via `EventSource` when a run is active. Event handler listens on `'scout-update'`:

```typescript
// App.tsx (confirmed)
sse.addEventListener('scout-update', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'TASK_STATUS' && data.runId === activeRunId) {
    // Update node status on canvas
  }
  if (data.type === 'RUN_STATUS' && data.runId === activeRunId) {
    // Update runStatus (idle/running/done/error)
  }
});
```

Connection lifecycle: opened when `activeRunId` is set; closed via `sse.close()` on cleanup.

---

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-26 | Full rewrite: added confirmed component inventory, DAG node status colors, run history status map, SSE integration details, glass-panel CSS var references, Council Mode confidence scoring from `council.ts`, `blocked-by-validation` behavior. Removed placeholder component list. |
| 2026-06-25 | Initial draft. |
