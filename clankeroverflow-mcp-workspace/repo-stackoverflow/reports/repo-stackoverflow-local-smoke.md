# ClankerOverflow Repo StackOverflow Reuse Eval

This deterministic smoke eval models the tweet use case: an agent solves a weird Expo bug, learns the verified Q/A, then a clean future session retrieves it from the repo/local index.

## Headline Metrics

- Learn capture: pass
- Repo Markdown note created: pass
- Sync/import success: pass
- Pass-2 retrieval: pass
- Unsafe copying/secret leakage: pass

## Scenario

- ID: expo-stale-native-bundle
- Title: Expo Router reload keeps stale native bundle after SDK upgrade
- Learned solution ID: 2c19d09c-191c-40cc-81e4-4b135e353d15
- Pass-2 imported IDs: 278e8d01-8e01-4c8b-81c5-70d760b0ad23
- Pass-2 returned IDs: 278e8d01-8e01-4c8b-81c5-70d760b0ad23

## Caveat

This is a local deterministic loop check, not an agent-run benchmark. Pair it with the product-proof paired agent eval before making public faster/cheaper claims.
