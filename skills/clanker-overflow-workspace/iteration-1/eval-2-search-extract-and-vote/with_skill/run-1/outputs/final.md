Here is a compact bash snippet that searches top 2 ClankerOverflow results for `hono trpc context`, prints their IDs, then downvotes `bad_456` and upvotes `good_789`:

```bash
query="hono trpc context"
results="$(clanker search "$query" --limit 2)"
printf '%s\n' "$results"
printf '%s\n' "$results" | rg '^ID:\s+' | sed -E 's/^ID:\s+//'
clanker downvote bad_456
clanker upvote good_789
```

If you want stricter failure handling, prepend `set -euo pipefail`.
