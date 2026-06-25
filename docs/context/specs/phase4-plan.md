# Implementation Plan: PortGrid Phase 4 — Constraints & Consensus

## Overview

With Phase 3 complete and the system stable, Phase 4 focuses on integrating the **"Category A" Safety Boundaries** and **Council Mode** from the Enhanced Reliability and Security Protocols. The goal is to ensure the AI can never produce destructive DAGs and that high-stakes requests are verified by multiple models.

## Phase 4 Task List

### Unit 21: Category A Safety Validator
**Goal:** Prevent destructive or unauthorized execution at the DAG generation boundary.
- Implement a `ValidatorLogic` class in `ScopeLogic` that applies assertions SA-01 through SA-06.
  - **SA-01/02:** Reject DAG nodes containing INSERT/UPDATE SQL or bash/sh code blocks.
  - **SA-04:** Reject `shell` or `exec` explicit node types.
  - **SA-05:** Verify agent targets are whitelisted.
- If validation fails, `ScopeLogic` should flag the node as "Rejected - Safety Violation" and halt progression to the canvas.

### Unit 22: Structured Output (Grammar/JSON Schema)
**Goal:** Ensure the LLM always returns syntactically valid DAG proposals.
- Update `OpenAICompatibleProvider` to pass strict `response_format: { type: "json_schema", ... }` parameters.
- Add an explicit JSON Schema definition for the `DAGProposal` interface.
- *Fallback:* Write a `.gbnf` (Grammar Backus-Naur Form) file in `docs/` for `node-llama-cpp` to use when running completely offline, ensuring local inference adheres to the same schema.

### Unit 23: Council Mode Triage & Consensus
**Goal:** Route complex queries through multiple expert models simultaneously and synthesize a consensus.
- Modify `RouteSwitch` to include a `TriageClassifier`. If a query contains high-risk keywords ("delete", "database", "credentials"), trigger Council Mode.
- Implement parallel execution: Route the prompt to 3 separate logical providers (e.g., standard, fast-fallback, local).
- Implement a `ConsensusSynthesizer` that evaluates the three returned DAGs, computes a disagreement score, and returns the most robust one (or flags it as "Low Confidence" for the UI).

## Acceptance Criteria for Phase 4
- DAGs proposing `rm -rf` or `UPDATE users` are caught by the Category A validator before reaching PortGrid.
- Output from `RouteSwitch` never fails `JSON.parse` due to strict schema enforcement.
- High-risk queries demonstrably trigger the parallel Council Mode routing.
