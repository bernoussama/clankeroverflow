# EADDRINUSE in GitHub Actions (ubuntu-latest) — intermittent, survives killing port 3000

## Searched ClankerOverflow first

Per the `clankeroverflow-mcp` skill, the smallest distinctive literal fingerprint for an error code gets searched first. I ran `clanker search` twice via the MCP `search_solutions` backend:

1. `search_solutions("EADDRINUSE")` — keyword exact returned 0; hybrid fallback unavailable (no `CLANKER_API_KEY`); keyword tiered returned 1 result about a Cloudflare Worker 429 anonymous-quota bug. Wrong error shape and stack.
2. `search_solutions("EADDRINUSE CI port")` — one tiered result about a Radix UI `:hover` compositor-layer bug. Wrong error shape and stack entirely.

Both results were skipped without voting (tags + error shape make them inapplicable; the skill explicitly says not to punish cross-stack misses). Search did not change the next step, so I moved into normal root-causing.

## Root cause (why killing port 3000 does not help)

EADDRINUSE here is almost certainly a `TIME_WAIT` socket, not a live process. When a listening socket closes without a clean shutdown, the kernel keeps the (host, port) in `TIME_WAIT` for ~60s. During that window:

- No process owns the port, so `lsof -i :3000`, `fuser -k 3000/tcp`, and `kill $(lsof -t ...)` all return nothing — there is nothing to kill.
- `bind()` still fails with EADDRINUSE unless the socket was created with `SO_REUSEADDR` (and the OS allows reuse of a `TIME_WAIT` local port).

The "every 3rd or 4th run" pattern is timing-dependent: sometimes the gap between runs exceeds the ~60s `TIME_WAIT` window and the port is free; sometimes it doesn't, and `bind()` collides with the lingering socket. Hardcoding port 3000 across runs is what makes the collision deterministic-but-flaky.

## Fix

Pick by preference — option 1 is the most portable and removes the failure mode entirely.

**1. Don't bind to a fixed port in CI (preferred).** Use an ephemeral port so the OS never hands you a `TIME_WAIT` collision:

```bash
# node/dev server example
PORT=0 node server.js        # OS picks a free port
# or
npx vite --port 0
```

Expose the chosen port to your tests via a readiness wait (`get-port` in Node, or read the logged "listening on <port>" line). This is the cleanest fix and the one I'd log.

**2. If port 3000 is genuinely required** (e.g. e2e tests hardcode it), do all three:

- Ensure the server sets `SO_REUSEADDR`. In Node, pass it explicitly so you don't depend on framework defaults:
  ```js
  server.listen({ port: 3000, host: "0.0.0.0" }, () => {});
  // Node sets SO_REUSEADDR by default on net servers; verify with your framework.
  ```
- Add graceful shutdown so sockets close cleanly instead of lingering into `TIME_WAIT`:
  ```yaml
  # .github/workflows/ci.yml
  - name: Run dev server + tests
    run: |
      npx vite --port 3000 &
      SERVER_PID=$!
      trap 'kill -TERM $SERVER_PID; wait $SERVER_PID' EXIT
      npx wait-on http://localhost:3000
      npx playwright test
  ```
- Add a readiness/leak check loop before bind if flakiness persists:
  ```bash
  for i in $(seq 1 30); do
    ! ss -ltn "sport = :3000" >/dev/null 2>&1 || { ss -ltn 'sport = :3000'; break; }
    sleep 1
  done
  ```

**3. Last-resort kernel knob (not recommended).** If you control the runner and need to shrink `TIME_WAIT`, `net.ipv4.tcp_tw_reuse=1` permits reusing local `TIME_WAIT` ports for incoming connections. It needs sudo and is a blunt instrument compared to options 1-2.

## Verification

- Confirm the failure is `TIME_WAIT`, not a zombie process, right after a failing run: `ss -tan 'sport = :3000'` should show a socket in `TIME-WAIT` with no owning process in `lsof -i :3000`.
- After applying option 1 (ephemeral port) or option 2 (reuse + graceful shutdown), run the job ~10 times in a matrix to confirm the intermittent EADDRINUSE is gone.

## Logging

I have not called `log_solution` for this fix. The skill says to log only after independent verification, and in this read-only evaluation I did not run the job to verify the fix end-to-end. If the fix is confirmed on the real runner, the entry would be a generic, portable note keyed on `EADDRINUSE` / CI / `TIME_WAIT` / ubuntu-latest with tags `node,eaddrinuse,ci,time-wait,github-actions` — no repo names, paths, or env vars.
