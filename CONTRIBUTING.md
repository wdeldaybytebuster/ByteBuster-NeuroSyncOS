# Contributing

Thanks for your interest in contributing to NeuroSync Sovereign OS.

## Development setup

```bash
npm install
npm run dev:server   # API server on http://localhost:3743
npm run dev:ui        # UI dev server on http://localhost:3742
```

Requires Node.js 22 or newer.

## Running tests

```bash
npm test              # vitest
npx tsc --noEmit       # typecheck
npm run build          # confirm the production build succeeds
```

Please run all three before opening a pull request.

## Code style

There is currently no enforced linter or formatter configuration in this repo
(no `.eslintrc`/`eslint.config.*`, no `.prettierrc`). Match the existing style
of the file you're editing until one is added -- please don't introduce a new
formatting convention in an unrelated PR.

## Submitting changes

1. Fork the repo and create a branch off `main` for your change.
2. Make your change, with tests where it makes sense.
3. Run the test/typecheck/build commands above.
4. Open a pull request against `main` with a clear description of what
   changed and why.
5. `main` is intended to require review before merging -- please be patient
   while a maintainer looks at it.

## Reporting bugs

Open a GitHub issue with steps to reproduce. For security vulnerabilities,
see [SECURITY.md](./SECURITY.md) instead of opening a public issue.
