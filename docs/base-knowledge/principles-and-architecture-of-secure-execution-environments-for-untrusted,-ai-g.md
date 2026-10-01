# Principles and Architecture of Secure Execution Environments for Untrusted, AI-Generated Code

Principles and Architecture of Secure Execution Environments for Untrusted, AI-Generated Code

The rapid development of autonomous software engineering agents and interactive AI workspaces has forced a major reassessment of cloud security boundaries [cite: 1, 2]. Traditional multi-tenant environments were designed to handle predictable, pre-vetted application workloads [cite: 1]. In contrast, modern agentic systems are defined by their capacity to write, compile, and execute arbitrary code on the fly to fulfill open-ended natural language objectives [cite: 3, 4]. This capability introduces a fundamental security paradox: an agent that can generate and run arbitrary code is highly useful, but it also functions as a dynamic, unvetted operator with the potential to execute malicious instructions [cite: 3, 5]. This report analyzes the threat model of agentic code execution, examines why language-level sandboxing fails in reflective runtimes, evaluates infrastructure-level isolation technologies, and outlines architectural blueprints for protecting sensitive credentials while running untrusted scripts.


--------------------------------------------------------------------------------

The Threat Model of Agentic Execution and the "Lethal Trifecta"

To design secure execution environments for AI agents, it is necessary to identify the vectors through which these systems can be compromised. Security concerns vary significantly between local developer assistants ("pets") and managed, production-grade agent fleets ("cattle") [cite: 1]. Local agents typically operate with broad access to the user's command-line interface, local files, and personal API tokens, making them highly vulnerable to local privilege escalation [cite: 1]. Managed agents operate in multi-tenant environments where the threat model focuses on lateral movement, host kernel escapes, and data exfiltration across tenants [cite: 6, 7].

The underlying security risk of autonomous agents stems from the "Lethal Trifecta": the simultaneous convergence of access to private data, consumption of untrusted or hostile content, and the capability of external reach [cite: 8].

Because LLMs treat natural language as both data and instruction, they are highly susceptible to prompt injection [cite: 8]. When an agent retrieves an external document, parses a git history, or processes database logs, it exposes its context window to hidden payloads embedded in that untrusted data [cite: 9, 10, 11]. For example, a diagnostic agent parsing a server log might encounter a crafted prompt injection instructing it to write a script that sends the contents of ~/.ssh/id_rsa or ~/.aws/credentials to an external endpoint [cite: 12]. If the agent's code execution environment has access to those file paths and outbound internet connectivity, the credentials can be exfiltrated silently [cite: 12].

This vulnerability is exacerbated by the execution of workspace configuration files and setup scripts [cite: 11]. Many agentic IDEs automatically run initialization functions, git hooks, or Model Context Protocol (MCP) startup scripts when a workspace is loaded [cite: 11]. If an agent clones a repository containing a poisoned git hook, that code can execute outside the sandbox before any explicit code tool is called, resulting in an immediate sandbox escape [cite: 11].

Furthermore, the "Sandbox Fallacy" occurs when platforms attempt to run both the orchestration harness (which manages sensitive credentials) and the untrusted agent code inside the same process boundary [cite: 10]. If the container boundary is breached, the attacker gains direct access to the application context, enabling them to decrypt stored tokens and compromise connected systems [cite: 10].


--------------------------------------------------------------------------------

Deconstructing the Failure of Language-Level Sandboxing

Software teams often try to secure code execution by implementing language-level sandboxes, using Abstract Syntax Tree (AST) analysis to parse code, or overriding built-in functions [cite: 4, 13, 14]. In highly reflective, dynamic runtimes like Python, these approaches represent "glass sandboxes" that provide an illusion of security but fail to resist deliberate escape attempts [cite: 13].

Python's object system is highly introspective [cite: 4, 15]. Every runtime element, from a simple string to a complex module, inherits from the base object class [cite: 13]. This interconnected object graph allows an attacker to bypass standard scope restrictions and blocklists by traversing the hierarchy to rebuild restricted capabilities [cite: 4, 13, 16].

In Python, object string serialization is an active execution process, not a passive data-formatting step [cite: 15]. When an exception occurs, the runtime automatically calls magic methods like __str__ or __format__ to render the error message [cite: 15]. In environments like n8n's python-task-executor (CVE-2026-0863), this formatting phase occurred outside the active sandbox checks [cite: 15]. By creating a custom object with a malicious __str__ method and triggering an exception, an attacker could execute arbitrary code before the sandbox's attribute blocklists could be evaluated [cite: 15].

Similarly, in-process runtimes like Pyodide are highly vulnerable to memory and execution escapes [cite: 10]. In CVE-2025-68668, attackers bypassed Pyodide's WebAssembly boundary [cite: 10]. Because the runner shared the same process context as the parent Node.js application, the escape granted direct access to the database credentials and master encryption keys stored in the process memory [cite: 10]. This demonstrates that secure isolation cannot be achieved inside the application process; it must be enforced at the infrastructure level [cite: 4].


--------------------------------------------------------------------------------

Infrastructure-Level Isolation: Virtualization, Interception, and Compilation

To execute untrusted, LLM-generated code securely, platforms must move beyond language-level boundaries and implement isolation at the virtualization, kernel, or compilation layers [cite: 7, 20].

## MicroVMs (Firecracker & Kata Containers)

MicroVMs provide a highly secure hardware-enforced boundary for running untrusted code [cite: 7, 21, 22]. By utilizing the Linux Kernel-based Virtual Machine (KVM) hypervisor, every individual sandbox boots its own independent, minimal Linux kernel [cite: 22, 23, 24].

Firecracker, developed by AWS for serverless workloads, achieves boot times of 100 to 150 milliseconds by removing legacy device drivers [cite: 21, 25, 26, 27]. It emulates only five core devices: virtio-net, virtio-block, virtio-vsock, a serial console, and a basic keyboard controller [cite: 28, 29].

Because each microVM has a dedicated kernel, it protects the host from kernel-level vulnerabilities [cite: 21, 26]. To escape, an attacker must compromise the guest kernel, escape the virtio emulation layer, and exploit the hypervisor [cite: 2]. This minimal attack surface makes microVMs the standard choice for high-risk, multi-tenant agent platforms [cite: 6, 7].


--------------------------------------------------------------------------------

## Userspace Interception (gVisor Sentry & Gofer)

gVisor, developed by Google, provides application-level sandboxing by intercepting system calls in a user-space kernel called the Sentry [cite: 24, 30, 31]. Written in memory-safe Go, the Sentry implements a from-scratch version of the Linux system call interface, including process lifecycle, signal handling, and network stacks [cite: 30, 31].

When an application inside a gVisor sandbox executes a system call, the underlying platform redirects it to the Sentry [cite: 30, 32]. If the application attempts to read a file, the Sentry forwards the request to a separate companion process called the Gofer using the LISAFS protocol [cite: 30, 32, 33]. The Gofer acts as a secure filesystem proxy, validating path configurations and returning safe file descriptors to the Sentry [cite: 31, 32, 33].

gVisor supports two execution modes:

Systrap: Uses ptrace or the host's SECCOMP_RET_TRAP filter to capture system calls, making it highly portable across systems without virtualization support [cite: 30, 31].

KVM Platform: Leverages host hardware virtualization extensions to accelerate address space switches, improving performance on bare-metal systems [cite: 30, 31].

While gVisor introduces a 10% to 30% overhead on I/O-heavy workloads, its lightweight memory footprint (~30 MiB) allows high deployment density without VM management overhead [cite: 7, 22, 34].


--------------------------------------------------------------------------------

## Capability-Based Compilations (WebAssembly & WASI)

WebAssembly (Wasm) paired with the WebAssembly System Interface (WASI) represents an alternative paradigm for running untrusted code [cite: 4, 35, 36]. Instead of virtualizing an operating system, source code is compiled into optimized bytecode executed inside a language-agnostic VM, such as Wasmtime [cite: 35, 37].

WASI enforces a strict, capability-based security model [cite: 37, 38]. A compiled Wasm module starts with zero ambient authority; it has no access to the network, system clocks, or the host filesystem [cite: 34, 35, 36]. To perform any I/O, the hosting environment must explicitly pass a "capability key" (a file descriptor or socket handle) to the module at initialization [cite: 38].

WASI 0.3.0 supports native asynchronous execution using a futures-and-streams model defined via the WebAssembly Interface Type (WIT) language, allowing non-blocking I/O operations without exposing host-level system resources [cite: 35, 36].


--------------------------------------------------------------------------------

Comparative Evaluation of Sandboxing Platforms

When building an enterprise-grade agent platform, selecting the right sandboxing runtime requires evaluating trade-offs across security boundaries, orchestration mechanisms, licensing, and GPU capabilities [cite: 7, 23].


--------------------------------------------------------------------------------

Technical Implementations of Workspace and Resource Restraints

Implementing a secure sandbox requires enforcing granular controls over local filesystems, host system calls, outbound network traffic, and system resources [cite: 9, 20].

## System Call Sanitization via Seccomp and eBPF

To protect the host kernel from exploitation, sandboxes must limit the system calls available to the guest operating system [cite: 42, 43]. The standard Linux kernel exposes over 300 system calls, many of which are unnecessary for running standard Python or shell scripts [cite: 42, 44]. Docker's default seccomp profile blocks approximately 44 of these calls, including dangerous operations like unshare and keyctl [cite: 42, 43, 44].

To configure these constraints, platforms can use auditing tools like strace or secimport to trace the specific system calls invoked by a script, then compile a tailored seccomp allowlist [cite: 42, 43, 45]. For example, blocklisting memfd_create (Syscall ID 319) prevents fileless execution attacks, forcing all file write attempts to occur on the monitored filesystem where they can be logged and audited [cite: 46].


--------------------------------------------------------------------------------

## Low-Level Network Gating and Secret Interception

To prevent data exfiltration, the execution environment must block direct access to raw credentials while allowing the agent to interact with external services [cite: 2, 12]. This is achieved using a split-compute architecture paired with an egress proxy [cite: 12].

The agent orchestration harness runs on a trusted host, while all generated scripts execute inside an isolated microVM sandbox configured with a default-deny egress policy [cite: 9, 12]. To communicate with allowed endpoints, outbound traffic is routed through a secret injection proxy [cite: 2, 12].

To intercept and modify encrypted HTTPS traffic, the proxy platform deploys a custom, ephemeral Certificate Authority (CA) inside the sandbox trust store [cite: 2, 12]. The proxy terminates TLS connections originating from the sandbox, evaluates match rules, injects authorization headers, and re-encrypts the request before forwarding it to the public internet [cite: 2, 12].

Using specific Matchers (e.g., path, method, and headers), platforms ensure that credentials are only injected into valid requests, preventing the agent from exfiltrating credentials to arbitrary endpoints [cite: 12].


--------------------------------------------------------------------------------

## GPU Sandboxing at Scale: Multi-Instance GPU (MIG) Passthrough

For agents executing machine learning or inference tasks, sandboxes require access to physical graphics hardware [cite: 3, 41]. Because gVisor's userspace kernel interception layer blocks direct PCIe register access, teams running GPU-heavy agent workloads must implement direct hardware passthrough within KVM-based microVMs [cite: 3].

On high-density bare-metal hosts (such as systems equipped with NVIDIA H100 GPUs), physical hardware is partitioned using Multi-Instance GPU (MIG) technology [cite: 3]. This splits a single H100 card into seven independent, hardware-isolated GPU instances (e.g., 1g.10gb slices) [cite: 3].

To attach these partitions to individual microVMs, platforms use a four-step process [cite: 3]:

Identify the PCIe address of the MIG slice on the host [cite: 3].

Bind the target device to the vfio-pci driver, releasing it from the host graphics driver [cite: 3].

Configure the microVM to mount the PCIe device directly into the guest physical address space [cite: 3].

Compile the guest kernel with direct CUDA runtime libraries, allowing native compute execution [cite: 3].

This architecture provides isolated GPU partitions for up to seven concurrent sandboxes per card, maintaining a strong virtualization boundary without the performance overhead of emulation layers [cite: 3].


--------------------------------------------------------------------------------

## Hypervisor Rate Limiting: Built-in Token Bucket Restraints

To prevent a compromised agent from launching resource-exhaustion or denial-of-service attacks, platforms must enforce strict I/O limits [cite: 9, 14]. Firecracker microVMs address this by implementing a Token Bucket rate limiter directly inside the virtual machine monitor (VMM) thread [cite: 28, 29, 47].

Resource consumption is governed by the following mathematical model [cite: 48]:

T_{\text{avail}} = \min\left(C_{\text{max}}, T_{\text{last}} + R_{\text{fill}} \times \Delta t\right)

Where:

T_{\text{avail}} represents the currently available resource tokens (operations or bytes) [cite: 48].

C_{\text{max}} is the maximum capacity of the bucket, governing the allowable burst duration [cite: 29, 48].

R_{\text{fill}} is the token refill rate, defining the sustained continuous throughput limit [cite: 29, 48].

\Delta t is the time elapsed since the last system call or I/O request [cite: 48].

When a sandboxed program attempts a disk write or network transfer, the VMM verifies if the bucket contains sufficient tokens [cite: 48]. If the bucket is empty, the operation is paused and rescheduled, protecting the host machine from I/O starvation [cite: 47, 48].


--------------------------------------------------------------------------------

Architectural Blueprint for Production Agent Sandboxes

To run untrusted, AI-generated code securely at scale, production architectures should separate concerns across distinct compute boundaries, isolating credentials and workloads into specialized security contexts [cite: 12].

## 1. Split Compute Contexts

Never run the orchestration harness and untrusted code in the same container or process [cite: 10]. Execute the main agent logic on a standard, trusted host, and run all dynamically generated code in ephemeral, isolated microVM sandboxes [cite: 12].

## 2. Ephemeral Runtimes & Snapshot Isolation

Build sandboxes using lightweight VM templates that start in under 150 milliseconds [cite: 25, 26]. For multi-turn tasks where state must persist, use snapshot-restore mechanisms to save and resume the VM state in under 30 milliseconds, avoiding state bleed across unrelated tasks [cite: 2, 3].

## 3. Perimeter Credential Brokering

Withhold raw API tokens and keys from the sandbox environment [cite: 2, 12]. Instead, route allowed outbound traffic through a TLS-terminating egress proxy that injects credentials at the network perimeter [cite: 2, 12]. Ensure injected headers overwrite any matching headers set inside the sandbox to prevent credential substitution attacks [cite: 12].

## 4. Granular File & Workspace Locks

Mount application-specific configuration files (such as .cursorrules or .git/hooks) as strictly read-only to prevent the agent from writing persistence backdoors [cite: 11]. Use mandatory access controls to limit workspace file modifications exclusively to the target directory [cite: 4, 11, 20].


--------------------------------------------------------------------------------

Sandboxing AI Agents | Octopus blog, https://octopus.com/blog/ai-agent-sandboxes

The Architecture of AI Agent Sandboxing: A Comparative Analysis - DEV Community, https://dev.to/mechcloud_academy/the-architecture-of-ai-agent-sandboxing-a-comparative-analysis-49fo

AI Agent Code Execution Sandboxes on GPU Cloud: E2B, Daytona, and Firecracker Setup Guide (2026) | Spheron Blog, https://www.spheron.network/blog/ai-agent-code-execution-sandbox-e2b-daytona-firecracker/

Notes on sandboxing untrusted code - why Python can't be sandboxed, comparing Firecracker/gVisor/WASM approaches - GitHub Gist, https://gist.github.com/mavdol/2c68acb408686f1e038bf89e5705b28c

Every Agent Needs a Computer: The Agent Sandbox Economy Web3-AI Opportunity | by Jesus Rodriguez | May, 2026, https://jrodthoughts.medium.com/every-agent-needs-a-computer-the-agent-sandbox-economy-web3-ai-opportunity-9fb3e8e3a4b3

E2B vs Modal: comparing AI code execution sandboxes in 2026 | Blog - Northflank, https://northflank.com/blog/e2b-vs-modal

Kata, gVisor, or Firecracker? Container Isolation Guide - Edera, https://edera.dev/stories/kata-vs-firecracker-vs-gvisor-isolation-compared

Securing AI SRE Agents With Credential Proxies and Sandboxes - Penligent, https://www.penligent.ai/hackinglabs/securing-ai-sre-agents-with-credential-proxies-and-sandboxes/

AI Agent Sandbox: How to Safely Run Autonomous Agents in 2026 - Firecrawl, https://www.firecrawl.dev/blog/ai-agent-sandbox

Why Sandbox Escapes Are Game Over for Workflow Automation - Medium, https://medium.com/@michael.hannecke/why-sandbox-escapes-are-game-over-for-workflow-automation-743313395311

Practical Security Guidance for Sandboxing Agentic Workflows and Managing Execution Risk | NVIDIA Technical Blog, https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/

Security boundaries in agentic architectures - Vercel, https://vercel.com/blog/security-boundaries-in-agentic-architectures

The Glass Sandbox - The Complexity of Python Sandboxing - Checkmarx, https://checkmarx.com/zero-post/glass-sandbox-complexity-of-python-sandboxing/

Sandbox escape via exception frame traversal in execute_code (subprocess mode), https://github.com/MervinPraison/PraisonAI/security/advisories/GHSA-qf73-2hrx-xprp

n8n Python Sandbox Escape (CVE-2026-0863): Code Node Vulnerability Explained, https://www.smartkeyss.com/post/cve-2026-0863-python-sandbox-escape-in-n8n-via-exception-formatting-and-implicit-code-execution

Jinja2 SSTI - HackTricks, https://hacktricks.wiki/en/pentesting-web/ssti-server-side-template-injection/jinja2-ssti.html

CodeBlock.exec() Sandbox Escape — Arbitrary Code Execution via object.subclasses() · Issue #6868 - GitHub, https://github.com/Skyvern-AI/skyvern/issues/6868

PraisonAI: Python Sandbox Escape via str Subclass startswith() Override in execute_code, https://github.com/advisories/GHSA-6vh2-h83c-9294

Redash's Python sandbox escape gives attackers full server access. Vendor says "use at your own risk" - Reddit, https://www.reddit.com/r/programming/comments/1s40jgg/redashs_python_sandbox_escape_gives_attackers/

AI Agent Sandbox Architecture: How to Let Agents Run Code Without Letting Them Run Everything - Towards AI, https://pub.towardsai.net/ai-agent-sandbox-architecture-how-to-let-agents-run-code-without-letting-them-run-everything-63a9293c35fb

The Container Runtime Nobody Told You About (And Four Others) - DEV Community, https://dev.to/copyleftdev/the-container-runtime-nobody-told-you-about-and-four-others-25e1

Firecracker vs gVisor: Which isolation technology should you use? | Blog - Northflank, https://northflank.com/blog/firecracker-vs-gvisor

How to Self-Host a Code Execution Sandbox for AI Agents (2026) - Beam Cloud, https://www.beam.cloud/blog/how-to-self-host-code-sandbox

microVMs Explained: Firecracker vs gVisor for Secure Workloads in 2026 - Aleksei Aleinikov, https://www.alekseialeinikov.com/en/blog/topics/devops/microvms-firecracker-vs-gvisor-secure-workloads-2026

How are you actually using agent sandboxes like E2B or Daytona? Trying to work out if I need one : r/AI_Agents - Reddit, https://www.reddit.com/r/AI_Agents/comments/1unl2r3/how_are_you_actually_using_agent_sandboxes_like/

How Every Major Tech Company Is Sandboxing AI Agents Differently - Medium, https://medium.com/@earlperry562/how-every-major-tech-company-is-sandboxing-ai-agents-differently-f41b65f14d8a

What is Firecracker? | Browserbase, https://www.browserbase.com/blog/what-is-firecracker

Firecracker — Secure and Fast microVMs | by Bhargav Shah - Medium, https://shahbhargav.medium.com/firecracker-secure-and-fast-microvms-628e6043b572

Firecracker, https://firecracker-microvm.github.io/

What is gVisor? | Blog - Northflank, https://northflank.com/blog/what-is-gvisor

Introduction to gVisor security, https://gvisor.dev/docs/architecture_guide/intro/

What is gVisor?, https://gvisor.dev/docs/

Filesystem - gVisor, https://gvisor.dev/docs/user_guide/filesystem/

Firecracker, gVisor, Containers, and WebAssembly - Comparing Isolation Technologies for AI Agents - SoftwareSeni, https://www.softwareseni.com/firecracker-gvisor-containers-and-webassembly-comparing-isolation-technologies-for-ai-agents/

Introduction · WASI.dev, https://wasi.dev/

WebAssembly Beyond the Browser: WASI 2.0, the Component Model, and Why Wasm Is About to Change Everything - DEV Community, https://dev.to/pockit_tools/webassembly-beyond-the-browser-wasi-20-the-component-model-and-why-wasm-is-about-to-change-3ep0

WASI's Capability-based Security Model - Yuki Nakata, http://www.chikuwa.it/blog/2023/capability/

Capabilities-Based Security with WASI - Marco Kuoni, https://marcokuoni.ch/blog/15_capabilities_based_security/

Sandbox - Documentation - E2B, https://e2b.dev/docs/sdk-reference/js-sdk/v1.0.7/sandbox

How Manus Uses E2B to Provide Agents With Virtual Computers, https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers

Best Code Execution Sandboxes for AI Agents 2026 | Blaxel Blog, https://blaxel.ai/blog/code-execution-sandboxes-for-ai-agents

How to Create Custom Seccomp Profiles for Docker Containers - OneUptime, https://oneuptime.com/blog/post/2026-02-08-how-to-create-custom-seccomp-profiles-for-docker-containers/view

Container security fundamentals part 6: seccomp, https://securitylabs.datadoghq.com/articles/container-security-fundamentals-part-6/

Seccomp security profiles for Docker, https://docs.docker.com/engine/security/seccomp/

secimport - PyPI, https://pypi.org/project/secimport/

Use of Seccomp Profiles to Secure Container Workloads - blog.jklug.work, https://blog.jklug.work/devops/seccomp-profiles/

Announcing the Firecracker Open Source Technology: Secure and Fast microVM for Serverless Computing - AWS, https://aws.amazon.com/blogs/opensource/firecracker-open-source-secure-fast-microvm-serverless/

Diagramming System Design: Rate Limiters - Codesmith, https://codesmith.io/blog/diagramming-system-design-rate-limiters
