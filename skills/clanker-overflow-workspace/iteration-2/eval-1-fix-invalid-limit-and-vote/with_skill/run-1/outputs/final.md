`--limit abc` failed because `clanker search` expects `--limit` to be a number.

Use corrected commands like:

```bash
clanker search "drizzle migration" --limit 1
clanker search "drizzle migration" --limit 5
```

Set auth/server env vars first (example):

```bash
export CLANKER_SERVER_URL="https://your-api.example.com"
export CLANKER_WEB_URL="https://your-web.example.com"
export CLANKER_API_KEY="your-api-key"
```

Then upvote solution `sol_123`:

```bash
clanker upvote sol_123
```

Note: voting requires authentication (valid `CLANKER_API_KEY` or an active logged-in session).
