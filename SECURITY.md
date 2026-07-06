# Security Policy

## Reporting a vulnerability

If you believe you've found a security vulnerability in NeuroSync Sovereign OS,
please report it privately rather than opening a public issue.

- Preferred: open a [GitHub private security advisory](https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS/security/advisories/new) for this repository.
- Alternative: email the maintainer directly (see the GitHub profile of the
  repository owner for contact details).

Please include steps to reproduce, the affected version/commit, and the
potential impact. We'll acknowledge reports as promptly as we can and follow
up with a fix timeline.

## Scope

This project is local-first software: it runs on your own machine, stores its
state in a local SQLite database, and does not require a cloud account to
operate. Security issues in scope include (but aren't limited to):

- Sandbox/containment escapes (command execution, filesystem isolation)
- Injection vulnerabilities (SQL, command, prompt injection with real impact)
- Credential or API key handling and storage
- Authentication/authorization bypass on any exposed endpoint

See [`docs/docs/04-security/threat-model.md`](./docs/docs/04-security/threat-model.md)
and [`docs/docs/04-security/security-privacy-model.md`](./docs/docs/04-security/security-privacy-model.md)
for the project's current security design and assumptions.

## Supported versions

This project is in **Alpha**. Only the latest tagged release and the `main`
branch are supported — security fixes land on `main` first and are included in
the next Alpha tag, not backported to older tags.

| Version | Supported |
|---|---|
| `main` | ✅ |
| `1.0.0-alpha.1` (latest) | ✅ |
| Older alpha tags | ❌ |
