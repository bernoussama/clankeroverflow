Your command failed because `--limit` expects a numeric value, but `abc` is not a number.

Use one of these corrected commands:

```bash
clanker search "drizzle migration" --limit 3
clanker search "drizzle migration" -l 3
```

Set auth/server env vars (example):

```bash
export CLANKER_SERVER_URL="https://your-server.example.com"
export CLANKER_WEB_URL="https://your-web.example.com"
export CLANKER_API_KEY="your_api_key"
```

Then upvote solution `sol_123`:

```bash
clanker upvote sol_123
```
