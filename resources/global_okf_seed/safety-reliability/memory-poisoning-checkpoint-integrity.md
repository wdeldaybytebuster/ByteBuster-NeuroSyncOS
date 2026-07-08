---
type: concept
title: Checkpoint Integrity and Memory Poisoning Defense
description: Untrusted content ingested mid-run can be serialized into an agent's checkpoint and re-activated on resume, so checkpoints should be cryptographically verified before rehydration.
confidence: 0.95
tags: [memory-poisoning, checkpoint-integrity, prompt-injection, crash-recovery, agent-security]
category: safety-reliability
source_doc: engineering-resilient-agentic-systems-a-comprehensive-blueprint-for-idempotent-e.md
---

# Checkpoint Integrity and Memory Poisoning Defense

## Core Idea
A long-running agent may ingest untrusted third-party data (e.g. a prompt injection hidden inside a PDF chunk) during execution; that poisoned context gets serialized directly into the agent's checkpoint database. When the agent later resumes from that checkpoint after a restart or pause, it deserializes the poisoned memory, resulting in persistent compromise of its behavior — the injection survives the crash/resume cycle rather than being scoped to one session. The mitigation is to validate every checkpoint against an immutable, append-only, cryptographically signed ledger (the source names Sigstore Rekor) before rehydrating it, checking a signed hash chain of the event history to verify the snapshot was not mutated or poisoned during its lifecycle before allowing safe resume.

## When To Use
Any durable/resumable agent that can ingest untrusted external content (documents, scraped pages, tool outputs) mid-run and persists state across restarts — the risk is specifically at the restart/resume boundary, not the live session.

## NeuroSync Applicability
Not currently implemented in NeuroSync. Resumed `workflow_runs` (via `resumeInProgressRuns()` in `src/core/coreexec/engine.ts`) are rehydrated directly from the `tasks`/`workflow_runs` SQLite tables with no cryptographic integrity check or signed hash-chain validation of the checkpointed state before resuming execution.

## Tradeoffs / Risks
Cryptographic checkpoint verification (e.g. against Sigstore Rekor) adds infrastructure dependency and per-resume verification latency. It protects the integrity of the checkpoint's bytes but does not by itself detect that content was semantically poisoned before it was ever checkpointed — it only proves the checkpoint wasn't tampered with after the fact.
