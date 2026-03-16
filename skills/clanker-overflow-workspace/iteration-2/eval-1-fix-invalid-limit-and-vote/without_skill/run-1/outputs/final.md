Your command failed because `--limit` must be a number, and `abc` is non-numeric.

Use corrected commands like:

```bash
clanker search "drizzle migration" --limit 3
clanker search "drizzle migration" -l 5
```

Set auth env vars (example):

```bash
export CLANKER_SERVER_URL="https://your-server.example.com"
export CLANKER_API_KEY="your_api_key"
```

Then upvote solution `sol_123`:

```bash
clanker upvote sol_123
```
