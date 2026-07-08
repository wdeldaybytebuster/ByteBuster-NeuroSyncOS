---
type: concept
title: Child Workflow Pattern for Sub-Agent Fault Isolation
description: Running each specialized sub-agent inside its own isolated child workflow so one sub-agent's crash degrades the parent to a partial result instead of terminating the whole run.
confidence: 0.95
tags: [fault-isolation, multi-agent, child-workflow, graceful-degradation, agent-reliability]
category: safety-reliability
source_doc: engineering-resilient-agentic-systems-a-comprehensive-blueprint-for-idempotent-e.md
---

# Child Workflow Pattern for Sub-Agent Fault Isolation

## Core Idea
In multi-agent architectures, an unhandled crash in one specialized sub-agent can otherwise cascade and terminate the entire parent workflow. The Child Workflow pattern runs each specialized sub-agent (e.g. a database analyzer, a file-system writer) inside its own isolated child workflow; if a sub-agent crashes on a timeout or a bad tool call, only that child workflow terminates — the parent intercepts the failure, collects results from sub-agents that did succeed, and synthesizes a partial response instead of failing outright. To prevent orphaned sub-agents from silently consuming tokens after the parent is cancelled, workflows configure a `ParentClosePolicy` of `TERMINATE` so all children are automatically torn down when the parent closes.

## When To Use
Multi-agent systems where a single sub-agent's failure should degrade gracefully to a partial result rather than take down the entire multi-step task.

## NeuroSync Applicability
Not currently implemented in NeuroSync — and current behavior is the opposite of this pattern. `executeRun()` in `src/core/coreexec/engine.ts` checks `if (failedTaskIds.size > 0) { ...status = 'failed'...; return false; }` unconditionally: a single failed task fails the entire `workflow_run`, with no isolation of that failure and no synthesis of a partial result from tasks that already completed. Tasks do run on separate poolifier worker threads (`src/core/coreexec/worker-pool.ts`, `DynamicThreadPool`), giving them thread-level execution isolation, but that isolation is not exploited for fault containment at the workflow level.

## Tradeoffs / Risks
Isolating failures and synthesizing partial results adds complexity to the parent's aggregation logic, which must handle "some children failed" as a first-class outcome rather than a simple success/failure binary. Without a `ParentClosePolicy`-equivalent teardown, cancelled parents can leave orphaned child agents running and consuming budget.
