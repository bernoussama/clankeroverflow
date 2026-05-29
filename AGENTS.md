# Guidelines

- Always update this file with things you discover about the codebase and would be useful for future agents.
- Use pnpm as the package manager.
- DO NOT use bun.
- Workspace packages must declare any other `@clankeroverflow/*` package they import in their own `package.json`; pnpm will not link undeclared workspace dependencies for package-local TypeScript resolution.
- When adding features, to the server use logging-best-practices skill, to verify where it makes sense to add logging and implement it properly.

## Unified Layout and Design

For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.

## Deployment

- Production deploys run through `.github/workflows/cd.yml`, which calls `pnpm run deploy` and expects the Alchemy/Cloudflare credentials and app configuration to be provided by GitHub Actions secrets/vars rather than a checked-in `packages/infra/.env.production` file.
