---
title: "Marketing / SEO / Agent-Discovery Content Plan — neurosync.bytebuster-tools.online"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-01"
review_cadence: "as needed until launch, then quarterly"
source_of_truth: true
---

# NeuroSync Sovereign OS — Marketing Page Content Plan

This is a ready-to-use content plan and copy deck for the public marketing page at
`neurosync.bytebuster-tools.online`. It covers brand/theme direction, full page copy,
technical SEO, and a dedicated agent-discovery layer (llms.txt + structured data) so
both humans and AI agents can evaluate the project quickly and accurately.

**Inputs used:** live site content (fetched 2026-07-01), `README.md`, `package.json`,
`docs/docs/00-foundation/project-charter.md`, `docs/docs/01-product/problem-statement.md`,
`docs/docs/05-delivery/milestone-roadmap.md`, `docs/sovereign-os-reality-audit-2026-06-30.md`
(the unsparing internal audit of what's actually built vs. spec), and `src/core/scoutdaemon/*`.

**Items I could not fill in and left as placeholders** (need your input before publish):
PayPal link, hourly training/consulting rates, a booking/contact method for consultations,
and exact legal entity name if different from "ByteBuster Tools." Search for `[[FILL:` to
find every placeholder.

---

## 1. Where the site is today (baseline)

The live page already has good bones: a "local-first, zero-trust" hero, six-module
architecture grid, security claims (0 npm vulnerabilities, air-gapped, WAL-mode SQLite),
and a "TOP SECRET" badge on ScoutDaemon. It reads as a finished product ("Beta Deploy").

That's the one thing to fix immediately: **the copy oversells the maturity.** The
project's own internal audit (`docs/sovereign-os-reality-audit-2026-06-30.md`) is blunt
that this is pre-alpha — core features like the Deference UI confidence-routing and
ScoutDaemon autonomous scheduling are either partially built or explicitly deferred.
Shipping "Beta Deploy" copy against that reality is a credibility risk the moment a
technical visitor (or an agent) reads the GitHub repo.

**The fix is not to undersell the work — it's real, substantial, and unusually
well-documented for a solo project.** The fix is to reframe "unfinished" as "in the
open," which is a stronger sovereignty story anyway: a privacy/sovereignty project that
hides its own status is a bad look; one that shows exact build state builds trust.

---

## 2. Brand & Theme

### Positioning statement

> NeuroSync Sovereign OS is the local-first control plane for people who want AI
> agents working for them, not their cloud vendor. It runs entirely on your machine,
> keeps every byte of memory in a SQLite file you own, and requires a human to approve
> anything before it acts. It is being built in the open, in public, at pre-alpha
> status — and you can watch, use, and shape it from here.

### Voice

- **Operator, not hype-man.** Write like someone briefing a technically literate peer,
  not like a SaaS landing page. Confident, declarative sentences. No exclamation-point
  stacking.
- **Radically honest about status.** "Pre-alpha" and "at your own risk" are said once,
  clearly, near the top — not buried in a footer. Technical audiences (and agents)
  trust projects that self-report accurately more than ones that claim "production
  ready" prematurely.
- **Insurgent, not corporate.** The enemy is vendor lock-in, cloud-processing of your
  data, and black-box agent behavior — not a named competitor. Language leans
  "sovereignty," "perimeter," "control plane," "assume breach" — terms already
  established on the live site. Keep them; they're good and on-brand.
- **No filler adjectives.** Cut "revolutionary," "game-changing," "cutting-edge."
  Every claim on the page should be checkable against the repo (this is also what
  gets a page cited by AI answer engines instead of ignored — see §6).

### Visual direction (for whoever builds/updates the actual page)

- **Dark-first UI**, terminal/HUD aesthetic already implied by "DCN: NS-OS-001" style
  doc codes and module callsigns (COREEXEC, BASEVAULT, PORTGRID, SCOPELOGIC,
  ROUTESWITCH, SCOUTDAEMON). Keep the callsign convention — it reads as
  military/ops-console, reinforces "control plane," and is memorable.
  copy through it if you use it.
- **One accent color for status, one for danger/risk.** E.g., a cold cyan/green for
  "operational" state indicators, amber/red reserved only for the pre-alpha risk
  banner and the ScoutDaemon "sealed" badge — so risk and mystery visually mean
  something instead of decorating everything.
- **Monospace for anything that is a literal fact** (version numbers, file paths,
  commands, license, doc codes). Sans-serif for prose. This is a small thing that
  reads as "built by an engineer" rather than "built by a marketer."
- **Status badges as first-class UI, not footer text**: a persistent small badge
  reading `PRE-ALPHA · USE AT YOUR OWN RISK` near the primary CTA, styled like a
  hardware warning label, not hidden in fine print.

### Tagline options (pick one for the hero, keep others for section headers / meta descriptions)

1. "Your AI. Your machine. Your rules." *(primary recommendation — short, sovereign, true)*
2. "Local-first AI orchestration. Nothing leaves your machine without your say-so."
3. "Escape the cloud. Keep the intelligence."
4. "Built in the open. Runs closed to everyone but you."

---

## 3. Information architecture (section order)

1. Risk/status banner (persistent, small, honest)
2. Hero (positioning statement + primary CTAs)
3. The Problem (why this exists — cloud lock-in, opaque agents, no audit trail)
4. How It Works — six modules, plain-language first, technical detail on expand/click
5. ScoutDaemon — the sealed section (hints only, see §5)
6. Where It Is Right Now — honest status/roadmap, phase-by-phase
7. Try It / Give Feedback (beta access + bug reports + how contributions are handled)
8. Work With ByteBuster — hourly AI/agent training, company consultation, privacy-first
   tool & AI program builds
9. Fund the Sovereign OS — PayPal, framed as funding independence, not begging
10. For AI Agents (machine-readable summary block, visible to humans too, but written
    for parsers — see §6)
11. Footer (license, repo, security contact, docs link, legal entity)

---

## 4. Full page copy

### 4.1 Risk / status banner (persistent strip, top of page)

```
PRE-ALPHA · TRY AT YOUR OWN RISK — this is real, running software under active
daily development. Expect sharp edges, missing features, and breaking changes
between commits. Found a bug? Tell us → [Report an issue]
```

### 4.2 Hero

**H1:** Your AI. Your machine. Your rules.

**Subhead:**
NeuroSync Sovereign OS is a local-first, zero-trust control plane for AI agents.
It orchestrates workflows, routes between local and free-tier language models, and
keeps every piece of memory in a SQLite database that never leaves your disk.
No cloud dependency. No vendor lock-in. Nothing acts without your approval.

**Primary CTA:** `Try the Pre-Alpha Build` → install/docs
**Secondary CTA:** `Read the Docs`
**Tertiary CTA (text link):** `See what's built vs. what's planned →` (links to §6 honest status)

**Trust row (small, under the fold):** `Apache 2.0 · Node.js + SQLite · 0 npm critical/high vulnerabilities · Built by one engineer, in public`

### 4.3 The problem

**H2: Cloud AI agents ask you to trust a black box.**

Every mainstream agent framework routes your data, your credentials, and your
decisions through someone else's servers. You don't see what it remembers, you
can't audit what it did, and if the vendor changes terms, your workflows break with
it.

NeuroSync flips that. It's a single Node.js process on your machine, backed by a
local SQLite database in WAL mode. Every agent action is a transactional, resumable
unit of work — if it crashes mid-task, it resumes from the last completed step
instead of re-running side effects (like re-sending an email or re-charging a card).
And nothing writes to your project or executes a command until a human clicks
approve.

### 4.4 How it works — six modules

Lead with the plain-language line for each; the technical detail can sit in an
expandable "for engineers" toggle so the page stays scannable for non-technical
readers.

- **PortGrid — the approval cockpit.**
  Plain: Every AI action waits here until you approve it, in one dashboard.
  Technical: Capability/tool governance and the human-in-the-loop approval queue,
  backed by draft-only worktree isolation — AI-proposed file changes are quarantined
  until approved, never written directly to your working tree.

- **ScopeLogic — turns a request into a plan.**
  Plain: You describe what you want; it interviews you and proposes a step-by-step
  plan before touching anything.
  Technical: Guided interview engine that outputs a draft DAG (directed acyclic
  graph) proposal — never auto-executed.

- **RouteSwitch — the model router.**
  Plain: Automatically picks which AI model handles each step, and falls back
  gracefully if one is unavailable, unaffordable, or off-policy.
  Technical: LLM provider registry with fallback chains, routing rules, and a
  "Free Mode Governor" that blocks paid-provider calls unless explicitly unlocked —
  so it never silently spends your API budget.

- **BaseVault — where your data actually lives.**
  Plain: Everything remembered — every workflow, every piece of context — is stored
  in one SQLite file you control, with automatic redaction of anything sensitive.
  Technical: WAL-mode `better-sqlite3` data layer, backups, and a tiered
  (public/internal/confidential) redaction system.

- **CoreExec — the engine room.**
  Plain: Runs the actual multi-step workflows, in the background, and survives
  restarts without losing your place.
  Technical: DAG workflow engine, worker-thread scheduler, and crash-safe execution
  with resumable state.

- **ScoutDaemon — sealed.** *(see §4.5 — do not describe fully here)*

### 4.5 ScoutDaemon — the sealed section

This is the one place on the page that should deliberately withhold detail. Keep
the "TOP SECRET" framing from the live site — it's already working — but tighten it
into hints that are true, verifiable against the repo, and intriguing without
explaining the mechanism.

**H2: ScoutDaemon [SEALED]**

> Six modules run in the open. This one doesn't — yet.
>
> What we'll say: ScoutDaemon watches your machine when you're not using it —
> idle time, thermal headroom, spare cycles — and does something with them. It
> already knows how to notice when your CPU is too hot to push harder, and back off
> on its own.
>
> What we won't say yet: what it's building toward. Call it a self-updating,
> user-driven creation layer. The rest stays sealed until it's ready.
>
> Curious what that means? [Watch the repo] or [request early access] and find out
> before anyone else does.

Notes for whoever finalizes this:
- Every sentence above is defensible against `src/core/scoutdaemon/idle.ts` (thermal
  throttling + idle detection is real, shipped code) without revealing the roadmap
  item that's actually deferred (autonomous scheduling / self-modifying behavior).
  That's the right amount of secret: true hints, no invented capability.
- Do not claim ScoutDaemon currently does autonomous background scheduling — per the
  project charter, that is explicitly out-of-scope for the current MVP phase. The
  copy above says "watches" and "notices," which is accurate today, and gestures at
  intent ("building toward") without asserting it's live.

### 4.6 Where it is right now (honest status / roadmap)

**H2: We're not going to tell you this is finished. Here's what's actually true.**

Short intro: This project publishes its own internal audits. If a feature isn't
built yet, this page says so.

Status table (mirrors `milestone-roadmap.md` — keep in sync as phases close):

| Phase | What it covers | Status |
|---|---|---|
| 0. Documentation & Governance | Naming conventions, module ownership | Closed |
| 1. Local Core Execution | SQLite schema, CoreExec queue, crash recovery | In progress |
| 2. PortGrid Dashboard | Approval cockpit UI | Planned |
| 3. BaseVault Memory MVP | Project scoping, redaction | Planned |
| 4. RouteSwitch Traffic Router | Quota ledger, fallback cascades | Planned |
| 5. ScopeLogic Proposal Engine | Interview-first DAG generation | Planned |
| 6. Manual Scout | Manual dependency/URL audits | Planned |
| 7. Hardening | Namespace isolation, seccomp, key encryption | Planned |

Add one line under the table: `Last synced with internal roadmap: [DATE]. Source of
truth: docs/docs/05-delivery/milestone-roadmap.md in the public repo — check it
yourself any time.` — linking to the actual file in GitHub is a strong trust/AEO
signal (see §6): it's a claim an agent or a skeptical human can verify in one click.

### 4.7 Try it / give feedback

**H2: Break it. Then tell us.**

This is pre-alpha software running on your machine with real file-system and
process access. Read the security model before you point it at anything you care
about. We want the bug reports — that's how this gets to beta.

- `Get the code` → GitHub repo
- `Read the security & privacy model` → docs link
- `Report a bug or request a feature` → GitHub Issues
- `[[FILL: Discord/Matrix/mailing list link if one exists, else omit this bullet]]`

One short paragraph: "This is a one-engineer project developed in the open. Issues
get triaged personally. If something breaks, screenshots and repro steps are the
most useful thing you can send."

### 4.8 Work with ByteBuster

This section needs to sit clearly *after* the open-source/community section, framed
as "how this stays sustainable," not as a hard sell. Keep it short — three offers,
one line each, one shared CTA.

**H2: This is a business too — here's how it stays funded.**

Building sovereign AI tooling in the open doesn't pay for itself. Alongside the
open-source project, ByteBuster offers paid, hands-on work for teams and individuals
who want the same local-first, privacy-first approach applied to their own stack:

- **AI & Agent Training (hourly).** Hands-on sessions for developers and teams
  learning to build, deploy, or evaluate AI agents — from prompt/tool design to
  local-first architecture decisions. `[[FILL: rate, e.g. "$X/hr, book via Y"]]`

- **Company Consultation.** Working sessions to assess where your org's AI usage
  creates cloud-dependency or data-exposure risk, and a concrete plan to reduce it.
  `[[FILL: engagement format — single session, retainer, scoped project?]]`

- **Privacy-First Tool & AI Program Builds.** Custom local-first tooling and
  internal AI programs built to the same standard as NeuroSync: on-device data,
  human-in-the-loop control, no silent vendor dependency.

**CTA:** `Book a consultation` → `[[FILL: booking link / contact email]]`

### 4.9 Fund the Sovereign OS

Keep this modest and tied to the sovereignty narrative — funding independence, not
soliciting charity.

**H2: Keep it independent.**

NeuroSync Sovereign OS isn't VC-funded, and that's on purpose — no investor pressure
to add telemetry, cloud lock-in, or a paid tier that quietly weakens the local-first
promise. If it's useful to you and you want to help keep it that way:

`[[FILL: PayPal link]]` — `Support development via PayPal`

One line under the button: "Funding goes directly into development time — no
cloud infra to feed, no team to scale. It stays a sovereign project."

### 4.10 Footer

- License: Apache 2.0 · [LICENSE]
- Repository: github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS
- Security: report vulnerabilities per SECURITY.md → `[[security contact email]]`
- Docs: `/docs`
- © 2026 ByteBuster Tools

---

## 5. Section-by-section keyword targets (for on-page SEO, not stuffing)

Work these phrases naturally into headings/body copy where they're already true —
do not add a keyword list at the bottom of the page (that's the kind of thing that
actively hurts AI-citation scoring, see §6).

- local-first AI orchestrator
- privacy-first AI agent platform
- self-hosted AI agent workflow engine
- sovereign AI operating system
- zero-trust AI agent orchestration
- local LLM router / LLM fallback routing
- human-in-the-loop AI agent approval
- SQLite-based AI memory (vs. cloud vector DB)
- vendor lock-in alternative for AI agents

---

## 6. Technical SEO + Agent Discovery layer

Per current best practice (and Google's own public guidance): write for people
first, use normal semantic HTML and headings, and don't fragment content into
AI-bait snippets. The structural additions below are aimed specifically at the
non-Google AI engines (ChatGPT, Claude, Perplexity, Copilot) and at autonomous
agents evaluating the project on a user's behalf — they don't hurt Google and they
materially help everywhere else.

### 6.1 Meta tags

```html
<title>NeuroSync Sovereign OS — Local-First, Zero-Trust AI Agent Orchestrator (Pre-Alpha)</title>
<meta name="description" content="A local-first AI agent orchestrator that runs entirely on your machine. Routes workflows across local and free-tier LLMs, stores all memory in local SQLite, and requires human approval before any action. Open source, Apache 2.0, pre-alpha.">
```

Keep "Pre-Alpha" in the `<title>` itself — it's a freshness/honesty signal and
prevents an agent or search snippet from implying production-readiness.

### 6.2 JSON-LD structured data

Two schema blocks, both accurate to what's actually shippable today — no invented
ratings, no fabricated review counts.

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "NeuroSync Sovereign OS",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Node.js 22+ (Linux, macOS, Windows)",
  "softwareVersion": "pre-alpha",
  "license": "https://www.apache.org/licenses/LICENSE-2.0",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "description": "A local-first, zero-trust AI agent orchestrator. Schedules background agents, routes requests across local and free-tier LLM providers, and keeps all state in a local SQLite database rather than a third-party cloud service.",
  "codeRepository": "https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS",
  "author": {
    "@type": "Organization",
    "name": "ByteBuster Tools"
  }
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is NeuroSync Sovereign OS ready for production use?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. It is pre-alpha software under active daily development. It is functional and safe to try, but expect missing features, sharp edges, and breaking changes between commits."
      }
    },
    {
      "@type": "Question",
      "name": "Does NeuroSync send my data to the cloud?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. It runs as a single Node.js process on your machine and stores all state in a local SQLite database in WAL mode. It only contacts external LLM providers when you configure and approve them, through the RouteSwitch module's Free Mode Governor."
      }
    },
    {
      "@type": "Question",
      "name": "Can the AI agents in NeuroSync act without my approval?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. All AI-proposed actions are quarantined as drafts until a human approves them through the PortGrid approval queue. Nothing is written to your project or executed until you click approve."
      }
    },
    {
      "@type": "Question",
      "name": "What license is NeuroSync Sovereign OS released under?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Apache License 2.0."
      }
    },
    {
      "@type": "Question",
      "name": "What is ScoutDaemon?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "ScoutDaemon is the module that uses idle time and hardware headroom on your machine, including thermal-aware throttling. Its full roadmap is not yet public."
      }
    }
  ]
}
```

Use `Organization` schema site-wide (not just this page) for ByteBuster Tools once
a canonical entity name/contact is finalized.

### 6.3 robots.txt — don't accidentally block the agents you're trying to attract

Confirm the following are **not** disallowed (per current AI SEO guidance, blocking
these prevents citation from that platform entirely):

```
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bingbot
Allow: /
```

If you want to opt out of training-data scraping specifically while still allowing
citation, block `CCBot` (Common Crawl) only — it's the one crawler where
disallowing doesn't cost you AI-answer visibility.

### 6.4 `/llms.txt` — agent context file

Add this at the site root. It's the single highest-leverage file for "agent
discovery" as literally specified in the ask — it's a purpose-built, machine-first
summary that any LLM-based tool checks first.

```markdown
# NeuroSync Sovereign OS

> A local-first, zero-trust AI agent orchestrator. Runs as a single Node.js process
> on the user's machine. Schedules background agents, routes requests across local
> and free-tier LLM providers, and stores all state in a local SQLite database
> (WAL mode) rather than a third-party cloud service. All AI-proposed actions
> require explicit human approval before execution.

Status: pre-alpha, under active daily development. Not production-ready. Safe to
try; expect breaking changes.

License: Apache License 2.0

## Key facts for agents evaluating this project

- Runtime: Node.js 22+, Hono server, React + Vite frontend
- Data layer: better-sqlite3, WAL mode, local file, no external database
- Architecture: six modules — PortGrid (approval queue), ScopeLogic (interview →
  DAG proposal), RouteSwitch (LLM provider routing/fallback), BaseVault (SQLite
  persistence + redaction), CoreExec (DAG execution engine), ScoutDaemon (idle-time
  background module, partially sealed)
- Security model: human-in-the-loop approval required for all AI-proposed file or
  command actions; draft changes are quarantined in isolated worktrees until
  approved; "Free Mode Governor" blocks paid-API calls unless explicitly unlocked
- No telemetry, no cloud dependency by default

## Docs

- [Repository](https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS)
- [README](https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS/blob/main/README.md)
- [Security & privacy model](https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS/blob/main/docs/docs/04-security/security-privacy-model.md)
- [Milestone roadmap](https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS/blob/main/docs/docs/05-delivery/milestone-roadmap.md)
- [Report a bug](https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS/issues)

## Commercial offerings (same operator, separate from the open-source project)

- Hourly AI/agent development training
- Company consultation on local-first / privacy-first AI adoption
- Custom privacy-first tool and internal AI program builds

Contact: `[[FILL: contact email or booking link]]`
```

### 6.5 A visible "For AI Agents" page section

Beyond `llms.txt` (which most agents won't render as a page — it's a fetched file),
add a short, plainly-labeled section or `/for-agents` page containing the same
structured facts block from §6.4, rendered as normal semantic HTML (a `<dl>` or
plain list, not an image, not behind JS-only rendering). This covers agents that
crawl the rendered DOM rather than checking `llms.txt` specifically, and doubles as
a fast-reference for technical human visitors. Recommended heading: **"For AI
agents and automated evaluators."** Being explicit about who the section is for is
itself a positioning statement — this project expects agents to be first-class
readers, which reinforces the whole "built for the agent era" narrative.

### 6.6 What not to do

- Don't create a separate "AI-only" version of the page with different claims than
  the human-facing copy — that's the "scaled content abuse" pattern search engines
  penalize, and it also just breaks trust if an agent quotes something a human
  visitor can't verify.
- Don't fabricate ratings, review counts, user testimonials, or "trusted by"
  logos. There's real content here (an honest pre-alpha status, real architecture,
  a real audit trail) — use that instead of manufactured social proof.
- Don't keyword-stuff the visible copy. Section 5's keyword list is for natural
  placement, not a footer wall of terms.

---

## 7. Open items — need your input before this ships

1. PayPal link for §4.9.
2. Hourly rate and booking method for AI/agent training (§4.8).
3. Consultation engagement format and how prospects should reach you (§4.8).
4. Confirm "ByteBuster Tools" is the legal/brand name to use in schema and footer.
5. Security contact email for the footer / `SECURITY.md` link-out.
6. Whether there's a Discord/Matrix/mailing list to add to §4.7 — if not, that
   bullet should be dropped rather than left as a dead placeholder.
7. Confirm you're comfortable with the ScoutDaemon copy in §4.5 — it was written to
   stay true to shipped code (`src/core/scoutdaemon/idle.ts`) while withholding the
   deferred roadmap item. If you want it more or less mysterious, that's a one-line
   edit away from either direction.
