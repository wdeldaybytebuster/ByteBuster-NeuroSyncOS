---
type: concept
title: Idempotency Key Three-Layer Architecture
description: A deterministic key-derivation and gatekeeping pattern across agent runtime, tool execution, and tool interface layers that prevents duplicate side effects when retries follow a timeout.
confidence: 0.95
tags: [idempotency, retry-safety, agent-reliability, tool-execution, deduplication]
category: safety-reliability
source_doc: engineering-resilient-agentic-systems-a-comprehensive-blueprint-for-idempotent-e.md
---

# Idempotency Key Three-Layer Architecture

## Core Idea
Idempotency — an operation applied multiple times without changing state beyond the first successful application — is the primary defense against duplicate side effects when an agent times out after a tool call actually succeeded and a naive retry re-executes it. The pattern requires strict separation across three layers. The Agent Runtime Layer deterministically derives a key as `Hash(workflow_run_id || step_id || tool_call_id)` — never randomly or server-side, since that would defeat deduplication on client-side retries. The Tool Execution Layer is a middleware gatekeeper that checks a high-throughput deduplication store before running the tool: if pending, it blocks/polls or returns a lock signal; if completed, it returns the cached response without re-executing; if permanently failed, it returns the cached error without retrying. The Tool Interface Layer maps the key to the target system's native mechanism (e.g. the `Idempotency-Key` HTTP header) or enforces a unique database constraint, and returns structured error codes (`VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`) so the agent can self-correct.

## When To Use
Any tool with non-idempotent side effects (payments, database writes, email dispatch, notifications) invoked from a retry-capable agent loop.

## NeuroSync Applicability
Partially implemented. NeuroSync's CoreExec DAG engine has an analog of the Tool Execution Layer's pending/completed distinction via claim leases: `executeRun()` in `src/core/coreexec/engine.ts` calls `claimTask(node.id, Date.now() + timeoutMs)` before executing a task and only allows re-claiming once `claim_lease` expires, preventing two workers from concurrently executing the same task. There is no deterministic hash-derived idempotency key construction, no cached-response-on-retry semantics for completed tasks (a completed task is skipped by status check, not replayed from a stored result), and no structured `VALIDATION_FAILED`/`CONFLICT`/`RATE_LIMITED` error-code contract at the tool interface layer.

## Tradeoffs / Risks
High-concurrency deployments (more than ten requests per second to the same resource) need a globally consistent, low-latency key registry such as Redis or Cloud Spanner. Commands like Redis `INCR` or `ZINCRBY` are inherently non-idempotent and need explicit deduplication tables rather than relying on the command's own semantics.
