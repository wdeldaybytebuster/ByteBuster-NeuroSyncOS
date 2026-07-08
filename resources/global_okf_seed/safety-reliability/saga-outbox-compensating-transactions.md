---
type: concept
title: Saga Pattern and the Outbox Pattern for Compensating Transactions
description: Breaking a multi-step distributed transaction into local steps with explicit compensating rollback actions, reliably published via a transactional outbox table.
confidence: 0.95
tags: [saga-pattern, outbox-pattern, distributed-transactions, rollback, agent-reliability]
category: safety-reliability
source_doc: engineering-resilient-agentic-systems-a-comprehensive-blueprint-for-idempotent-e.md
---

# Saga Pattern and the Outbox Pattern for Compensating Transactions

## Core Idea
The Saga pattern handles distributed transactions across microservices and external APIs by breaking a multi-step transaction into local steps; if any step fails, the saga executor triggers compensating transactions in reverse order to undo already-completed steps. Sagas can be Orchestration-based (a centralized coordinator such as a Temporal workflow explicitly drives each step and its compensation, maximizing observability) or Choreography-based (decentralized — each service publishes an event on completion and downstream services react, avoiding a central point of control but making overall transaction state harder to observe). To guarantee rollback events are reliably published despite distributed-write failures, the Outbox Pattern writes a `RollbackEventDTO` into a local `transaction_log` table in the same database transaction as the failure; an independent log tailer reads and publishes it to a message broker, with compensation consumers tracking explicit `SUCCESS`/retry/`DEATH` (for human intervention) states.

## When To Use
Multi-step agent workflows that touch multiple external systems or services, where a failure partway through must not leave the world in a half-completed, inconsistent state (e.g. an agent that books a resource in one system and charges in another).

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's CoreExec DAG engine has no compensating-transaction mechanism — `executeRun()` in `src/core/coreexec/engine.ts` simply marks the whole `workflow_run` as `'failed'` when any task fails (the `failedTaskIds.size > 0` branch), with no reverse-order rollback of already-completed tasks' side effects, no Saga orchestrator or choreography, and no outbox table for reliable event publication.

## Tradeoffs / Risks
Choreography sagas are decentralized and can be hard to debug and observe compared to orchestration. The Outbox pattern requires an additional log-tailer process and adds write amplification, since every compensating action is written twice: once to the outbox and once when actually applied. Compensating transactions themselves can fail and require their own retry/dead-letter (`DEATH`) handling.
