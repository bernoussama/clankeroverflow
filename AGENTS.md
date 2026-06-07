# Guidelines

- Use pnpm as the package manager.
- DO NOT use bun.

## Unified Layout and Design

For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.
