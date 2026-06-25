**Document Summary: Integration Map**

| Target Service | Protocol | Auth | Purpose | Fallback |
| --- | --- | --- | --- | --- |
| OpenRouter / OpenCode Zen | HTTPS JSON | API Key (User) | Outbound LLM reasoning calls | Local Mock Offline Provider |
| MCP Servers | stdio / HTTP | Token / local | Custom tool execution (e.g. SQLite, Git) | Terminate task with mock error |

===

<!-- Append-only log of changes managed by BaseVault -->
