---
type: concept
title: Multi-Tier Runtime Guardrails Against Agent Threats
description: Deterministic or probabilistic middleware that intercepts agent inputs/outputs to guard against six failure types — jailbreaks, data leaks, toxicity, policy violations, hallucinations, and schema non-compliance.
confidence: 0.95
tags: [governance, guardrails, security, prompt-injection, data-leak]
category: safety-reliability
source_doc: systemic-governance-of-autonomous-agents-deference,-multi-tier-guardrails,-and-h.md
---

# Multi-Tier Runtime Guardrails Against Agent Threats

## Core Idea
Operationalizing agent safety in production requires a multi-layered guardrail architecture that intercepts inputs and outputs across the execution path, protecting against six primary failure types: jailbreaks, data leaks, toxicity, policy violations, hallucinations, and format/schema non-compliance. Simple conversational guardrails (dialogue-drift filters) don't address sophisticated adversarial manipulation of active tool-using agents — specialized systems are needed, such as prompt-injection detectors that use vector similarity against known attack templates plus canary tokens to detect untrusted-data leakage into the execution context. The threat surface also extends to multi-agent settings: research cited in the source found the majority of foundational models vulnerable to inter-agent trust exploitation, where AI-to-AI communication bypasses standard edge-level safety filters at a substantially higher success rate than direct prompt injection against a single model.

## When To Use
Deploy runtime guardrails whenever an agent processes untrusted input (user text, scraped web content, tool output) or produces output that could leak sensitive data, violate policy, or execute unsafe actions — guardrails sit at the boundary regardless of what internal reasoning architecture the agent uses.

## NeuroSync Applicability
Partially implemented. `SensitiveDataRedactor` (`src/core/basevault/redactor.ts`) is a real, regex-based output-filtering guardrail that covers exactly one of the six categories from the source — data leaks — scrubbing API keys, emails, and phone numbers from text via `redact()`/`redactObject()`, tiered by `DataTier` (PUBLIC/INTERNAL/CONFIDENTIAL), and used at the HITL resolution boundary in `src/server/routes/todos.ts`. The other five categories (jailbreak/prompt-injection detection, toxicity filtering, policy-violation checks, hallucination detection, and schema-compliance enforcement) have no dedicated guardrail middleware in the codebase; `src/core/routeswitch/triage.ts`'s `TriageClassifier.isHighRisk()` is a simple keyword blocklist (e.g. "delete", "credentials", "sudo") that routes to Council Mode, not a dedicated guardrail layer.

## Tradeoffs / Risks
Guardrails that rely on keyword or regex matching (as opposed to semantic/vector-based detection) are trivially evaded by paraphrasing or encoding the sensitive content differently. The source notes that isolated, model-level guardrails cannot address collective/multi-agent risks like inter-agent trust exploitation — those require systemic, edge-level controls rather than per-model filtering.
