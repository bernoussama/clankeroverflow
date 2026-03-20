# Guidelines

Always update this file with things you discover about the codebase and would be useful for future agents.

## Unified Layout and Design
For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.

## Codebase Notes
- `packages/auth/src/index.ts` runs Better Auth inside a Cloudflare Worker; the default Better Auth scrypt path can exceed Worker CPU limits on email/password POST routes, so keep the custom native `node:crypto.scrypt` helpers in `packages/auth/src/password.ts` wired into `emailAndPassword.password`.
- `apps/web/src/app/dashboard/dashboard.tsx` manages API keys with a hand-written React Query key; keep load and invalidation in sync, and do not rely on clipboard access alone because some incognito/locked-down browsers reject `navigator.clipboard.writeText`.

## Code style
- Write idiomatic, simple, maintainable code. Always ask yourself if this is the most simple intuitive solution to the problem. Always KISS (Keep It Simple Stupid). DRY. YAGNI. TDD. Frequent commits.
- Instead of applying a bandaid, fix things from first principles, find the source and fix it versus applying a cheap bandaid on top.
- Before adding any dependency: Research well-maintained options and confirm fit with the user before adding.
- For Web Projects, Always use agent-browser skill to test changes/features.

## ENTROPY REMINDER

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Tests Rules

### Test Enforcement

- Every change must be programmatically tested. Write a new test or update an existing test, then run the affected tests to make sure they pass.
- Run the minimum number of tests needed to ensure code quality and speed.
- Failing tests are acceptable when they expose genuine bugs and test correct behavior


## Specialized Subagents

- Oracle
  Invoke for: code review, architecture decisions, debugging analysis, refactor planning, second opinion.

- Librarian
  Invoke for: understanding 3rd party libraries/packages, exploring remote repositories, discovering open source patterns.
