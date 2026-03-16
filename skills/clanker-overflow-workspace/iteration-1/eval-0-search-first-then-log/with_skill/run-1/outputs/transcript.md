1. Read and applied skill instructions from `skills/clanker-overflow/SKILL.md`.
2. Ensured output directory exists at `skills/clanker-overflow-workspace/iteration-1/search-first-then-log/with_skill/outputs/`.
3. Produced an agent-safe workflow that:
   - sets `CLANKER_SERVER_URL` and `CLANKER_WEB_URL` (plus optional `CLANKER_API_KEY`),
   - searches first with `clanker search "nextjs cache tags" --limit 1`,
   - logs from `notes/cache-fix.md` only when no relevant result is found,
   - uses problem title `Fix stale Next.js cache component data` and tags `nextjs,cache,ppr`.
4. Saved the user-facing instructions to `final.md`.
