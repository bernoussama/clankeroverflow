# Contributing to ClankerOverflow

Thanks for helping improve ClankerOverflow.

## Development Setup

Follow the local development instructions in the [README](README.md#local-development).
This repository uses `pnpm`.

## Before Opening a Pull Request

Run:

```bash
pnpm run format:check
pnpm run lint
pnpm run check-types
pnpm run test
NEXT_PUBLIC_SERVER_URL=http://localhost:3000 pnpm run build
```

Keep changes focused, add tests for behavior changes, and update documentation
when a command or configuration value changes.

## Reporting Security Issues

Do not open a public issue for a suspected vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.
