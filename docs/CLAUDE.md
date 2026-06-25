# CLAUDE.md — Claude Code Entry Context

## Required Reading

Before implementing or making architectural decisions, read these files in order:

1. `context/project-overview.md`
2. `context/architecture.md`
3. `context/ui-context.md`
4. `context/code-standards.md`
5. `context/ai-workflow-rules.md`
6. `context/progress-tracker.md`
7. Active spec in `context/specs/`

## Session Start Instruction

Summarize the current phase, active goal, constraints, and next implementation unit before editing files.

## Build Discipline

- Implement exactly one unit at a time.
- Respect documented architecture invariants.
- Use existing patterns before creating new ones.
- Ask for clarification only when required; otherwise record minor uncertainties as assumptions and proceed within the safest documented boundary.
- Update `context/progress-tracker.md` after each meaningful change.

## Protected Areas

Do not modify protected generated files, credentials, lockfiles, infrastructure configs, or migration history unless the active spec explicitly instructs it.
