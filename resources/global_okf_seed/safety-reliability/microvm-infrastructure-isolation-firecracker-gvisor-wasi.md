---
type: concept
title: MicroVM and Userspace-Kernel Infrastructure Isolation
description: Firecracker microVMs, gVisor's userspace kernel, and WASI's capability-based model provide three distinct infrastructure-level isolation boundaries for running untrusted AI-generated code.
confidence: 0.95
tags: [microvm, firecracker, gvisor, wasi, sandboxing]
category: safety-reliability
source_doc: principles-and-architecture-of-secure-execution-environments-for-untrusted,-ai-g.md
---

# MicroVM and Userspace-Kernel Infrastructure Isolation

## Core Idea
Because language-level sandboxing fails in reflective runtimes, secure execution of untrusted AI-generated code must happen at the virtualization, kernel-interception, or compilation layer. MicroVMs (Firecracker, used by AWS/E2B) use the KVM hypervisor to boot an independent, minimal Linux kernel per sandbox, emulating only five core virtio devices to minimize attack surface and achieving 100-150ms boot times — an attacker must compromise the guest kernel, escape virtio emulation, and exploit the hypervisor to escape, making microVMs the standard for high-risk multi-tenant agent platforms. gVisor (Google) instead intercepts syscalls in a memory-safe, Go-based userspace kernel ("Sentry") that reimplements the Linux syscall interface from scratch, forwarding filesystem access through a companion "Gofer" process over the LISAFS protocol; it runs in Systrap mode (ptrace/`SECCOMP_RET_TRAP`, portable, no virtualization needed) or KVM mode (hardware-accelerated), at the cost of 10-30% I/O overhead but with a much smaller (~30 MiB) memory footprint than a full VM. WebAssembly plus WASI takes a third approach — capability-based security where a compiled Wasm module starts with zero ambient authority (no network, clock, or filesystem access) until the host explicitly grants capability keys (file descriptors or socket handles) at initialization.

## When To Use
Choose Firecracker-class microVMs when the threat model includes untrusted, potentially malicious multi-tenant code and kernel-level isolation is required; choose gVisor when higher deployment density and lower per-sandbox memory overhead matter more than the strongest possible isolation boundary; choose WASI/Wasm when the workload can be compiled to Wasm and a capability-based, zero-ambient-authority model is a natural fit.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's sandboxing (`src/core/portgrid/sandbox.ts`, `src/core/portgrid/terminal-session.ts`) uses `bwrap` (bubblewrap) — a lightweight Linux namespace-based container tool — which provides process/filesystem/network namespace isolation on the same host kernel, not a hardware-virtualized microVM (Firecracker/Kata) or a userspace-reimplemented kernel (gVisor); an attacker escaping `bwrap`'s namespace isolation would reach the same host kernel that other processes run on, unlike Firecracker's independent guest kernel per sandbox.

## Tradeoffs / Risks
MicroVMs impose real per-sandbox boot latency (100-150ms) and memory overhead versus a lighter namespace tool like `bwrap`. gVisor's 10-30% I/O overhead can matter for I/O-heavy agent workloads. WASI's capability model requires source code to be compilable to Wasm, ruling out arbitrary interpreted-language execution without additional tooling.
