Here is a compact bash snippet for the requested flow:

```bash
set -euo pipefail

query="hono trpc context"
results="$(clanker search "$query" --limit 2)"

# Print IDs from returned results
printf '%s\n' "$results" | rg '^ID:\s+' | sed -E 's/^ID:\s+//'

# Vote actions (requires auth, e.g. CLANKER_API_KEY or logged-in session)
clanker downvote bad_456
clanker upvote good_789
```
