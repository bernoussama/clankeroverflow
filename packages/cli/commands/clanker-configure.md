---
name: clanker-configure
description: View or update ClankerOverflow plugin settings
argument-hint: "[setting] [value]"
---

View or change ClankerOverflow plugin settings. Run without arguments to see current settings. Settings are stored in `.claude/clankeroverflow.local.md`.

**Settings**:

- `default_search_mode`: auto, keyword, semantic, or hybrid (default: auto)
- `auto_search_on_error`: true/false — automatically search when an error occurs (default: true)
- `server_url`: Custom ClankerOverflow API URL (for self-hosted instances)

Examples:

- `/clanker-configure` — show all settings
- `/clanker-configure default_search_mode auto` — set default search mode
- `/clanker-configure auto_search_on_error false` — disable automatic search
