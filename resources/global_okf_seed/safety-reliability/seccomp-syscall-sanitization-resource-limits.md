---
type: concept
title: Seccomp Syscall Sanitization and Token-Bucket Resource Limits
description: Restricting a sandbox's available syscalls with a tailored seccomp profile and bounding its I/O throughput with a hypervisor-level token bucket to stop fileless execution and denial-of-service.
confidence: 0.95
tags: [seccomp, ebpf, resource-limits, token-bucket, sandbox-hardening]
category: safety-reliability
source_doc: principles-and-architecture-of-secure-execution-environments-for-untrusted,-ai-g.md
---

# Seccomp Syscall Sanitization and Token-Bucket Resource Limits

## Core Idea
Because the Linux kernel exposes over 300 syscalls, most unnecessary for running Python or shell scripts, sandboxes should restrict the guest's syscall surface via seccomp — Docker's default profile already blocks roughly 44 dangerous calls like `unshare` and `keyctl`. Teams can trace a script's actual syscalls with `strace`/`secimport` to compile a tailored allowlist, and specifically blocklisting `memfd_create` (syscall 319) prevents fileless-execution attacks by forcing all file writes onto the monitored, auditable filesystem. Separately, to stop a compromised agent from launching resource-exhaustion or denial-of-service attacks, Firecracker microVMs enforce a Token Bucket rate limiter directly inside the VMM thread for I/O: available tokens `T_avail = min(C_max, T_last + R_fill × Δt)`, where `C_max` bounds burst duration and `R_fill` sets the sustained throughput ceiling — when a disk write or network transfer would exceed available tokens, the operation is paused and rescheduled rather than allowed to starve the host.

## When To Use
Apply syscall allowlisting to any sandbox running untrusted code regardless of the outer isolation layer — it is a defense-in-depth measure, not a replacement for microVM or namespace isolation. Apply token-bucket I/O limiting whenever a sandbox might be driven to exhaust host disk or network bandwidth, whether by a bug or a malicious payload.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `CommandSandbox` (`src/core/portgrid/sandbox.ts`) restricts what can run via a command-name allowlist (`ALLOWLIST` set of roughly 20 binaries) and blocks shell metacharacters, but this operates at the command-name/argument level, not the syscall level — there is no seccomp profile, eBPF filter, or `memfd_create` blocklist applied to the `bwrap`-spawned processes, and no token-bucket I/O rate limiter anywhere in `src/core/portgrid` or `src/core/coreexec`; the only time bound present is `CommandSandbox`'s flat 30-second wall-clock timeout (`setTimeout(..., 30000)` in `sandbox.ts`'s `execute()`).

## Tradeoffs / Risks
A command-name allowlist (NeuroSync's current approach) is coarser than syscall-level filtering — an allowlisted binary like `python` or `python3` can still, in principle, invoke a wide range of syscalls the allowlist itself never inspects. Building and maintaining a correct seccomp profile requires tracing real workloads and risks breaking allowlisted commands if the profile is too restrictive.
