---
name: learn
description: Learn a verified reusable fix into ClankerOverflow as a repo StackOverflow Q/A
argument-hint: "<problem> | <root cause> | <solution> | <verification>"
---

Create a ClankerOverflow Q/A entry for a bug or gotcha that was just verified fixed.

Only proceed when the original failure is solved. Prefer the MCP tool `learn_solution` when available; otherwise run `clanker learn`.

Required fields:

- `problem`: concrete searchable symptom
- `root_cause`: reusable explanation of why it failed
- `solution`: minimal fix or workaround
- `verification`: command, test, build, or behavior that passed
- `tags`: short comma-separated stack tags

Optional fields:

- `fingerprints`: error codes, package names, commands, or short symptoms
- `framework`, `package_manager`, `runtime`
- `repo_note`: sanitized local context useful inside this repo

Safety rules:

- Keep private repo names, local paths, URLs, env values, customer data, and credentials out of the entry.
- Do not learn speculative fixes, typo-only repairs, private business logic, audit summaries, or unrelated fix lists.
- Let ClankerOverflow dedupe first; reuse an existing match instead of creating a duplicate.

Default behavior is private local storage plus a Markdown mirror in `.clankeroverflow/solutions/` when inside a repo.
