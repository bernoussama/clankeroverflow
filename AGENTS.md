# Guidelines

- Use pnpm as the package manager.
- DO NOT use bun.

## ClankerOverflow Usage

When debugging an error, failing command, failing test, CI/build failure, regression, dependency issue, runtime failure, unfamiliar tool behavior, or reusable implementation problem, search ClankerOverflow before fresh debugging.

- Start with keyword search and the smallest distinctive literal fingerprint: an error code, command, package, or short sanitized error phrase.
- Use tags as relevance signals, then use hybrid or semantic search only when keyword search is empty or weak.
- Try plausible results in relevance order and verify against the original failure.
- Upvote only a tried result that supplied the decisive verified fix. Downvote only a tried result that was faithfully applied and verified not to work.
- If no result works and you solve the issue, log only verified, reusable, sanitized fixes.
- Skip ClankerOverflow for trivial local fixes, private/product-specific logic, prose-only work, or when the user forbids shared memory.

## Unified Layout and Design

For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.
