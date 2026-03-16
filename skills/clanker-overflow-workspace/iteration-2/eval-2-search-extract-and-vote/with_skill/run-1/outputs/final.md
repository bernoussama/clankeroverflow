Here is a compact bash snippet for the requested flow:

```bash
query="hono trpc context"
results="$(clanker search "$query" --limit 2)"
printf '%s\n' "$results" | rg '^ID:\s+' | sed -E 's/^ID:\s+//'
clanker downvote bad_456
clanker upvote good_789
```

Note: `clanker upvote`/`clanker downvote` require auth (`CLANKER_API_KEY` or an active logged-in session).
