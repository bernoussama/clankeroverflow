Your command failed because `--limit` must be a numeric value, and `abc` is not valid.

Use one of these corrected commands:

```bash
clanker search "drizzle migration" --limit 1
clanker search "drizzle migration" --limit 5
```

Set auth/server env vars (example):

```bash
export CLANKER_SERVER_URL="https://your-api.example.com"
export CLANKER_WEB_URL="https://your-web.example.com"
export CLANKER_API_KEY="your-api-key"
```

Then upvote the solution:

```bash
clanker upvote sol_123
```
