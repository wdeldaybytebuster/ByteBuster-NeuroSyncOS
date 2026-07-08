---
type: concept
title: Mid-Stream Failover Boundary and Request Migration
description: General SaaS API gateways cannot transparently swap models after streaming has started, while disaggregated self-hosted serving stacks can migrate an in-flight generation to a new worker invisibly.
confidence: 0.95
tags: [failover, streaming, request-migration, llm-gateway, kv-cache]
category: safety-reliability
source_doc: dynamic-system-control-in-enterprise-llm-gateways-architectural-reference-for-di.md
---

# Mid-Stream Failover Boundary and Request Migration

## Core Idea
A failure that occurs mid-stream, after a client has already received part of a generated response, is fundamentally harder to recover from than a pre-generation failure. For general SaaS API gateways, models cannot be transparently swapped mid-sentence — stitching text from two different models produces syntactic breaks and corrupted JSON — so the failure must propagate to the client, which discards the partial output and retries cleanly. In high-performance self-hosted serving with disaggregated prefill/decode pools (e.g. NVIDIA Dynamo with vLLM/TensorRT-LLM), true Request Migration is possible: a migration operator intercepts each outgoing token from the failing worker's SSE stream in real time, appends it to the request's internal token sequence, and on worker failure hands the original prompt plus accumulated tokens to a new worker, which reconstructs the KV cache and continues generation from the exact failure point — invisible to the client. Worker failures are detected via etcd HA watch channels with TTL lease keep-alives, with failover typically completing in under 30 seconds.

## When To Use
General API gateways calling external SaaS providers must treat mid-stream failure as terminal (propagate and retry from scratch); only self-hosted, disaggregated serving stacks with internal KV-cache transfer infrastructure can offer seamless mid-stream continuation.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync calls external SaaS providers via RouteSwitchEngine rather than running a disaggregated self-hosted inference stack, placing it in the "general API gateway" category described in the source — but there is no explicit mid-stream failure handling in `src/core/routeswitch/engine.ts` beyond the standard fallback-on-request-failure path; a mid-stream disconnect during streaming would need to be handled at the client/UI layer.

## Tradeoffs / Risks
True request migration requires disaggregating prefill and decode into separate pools and transferring KV cache over the network (via NIXL/UCX or similar), which directly impacts Time to First Token and only pays off at self-hosted-serving scale. For externally-hosted providers, "discard and retry" is the only option and always costs the user a visible interruption.
