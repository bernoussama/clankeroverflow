const REPLACEMENTS: Array<[RegExp, string, string]> = [
  [/\b([A-Z][A-Z0-9_]{2,})=(?:"[^"]*"|'[^']*'|[^\s"'`]+)/g, "$1=<redacted>", "env var value"],
  [
    /\b(?:sk|pk|rk|clk|ghp|github_pat|xoxb|xoxp)_[A-Za-z0-9_-]{12,}\b/g,
    "<redacted-secret>",
    "secret-looking token",
  ],
  [
    /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|[^\s/]+\.internal)(?:[^\s)]*)/g,
    "<private-url>",
    "private URL",
  ],
  [/(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/[^\s)'"`]+/g, "<local-path>", "local filesystem path"],
  [/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\[^\s)'"`]+/g, "<local-path>", "local filesystem path"],
];

export function scrubText(value: string) {
  const warnings: string[] = [];
  let text = value;
  for (const [pattern, replacement, label] of REPLACEMENTS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      warnings.push(`Redacted ${label}.`);
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
  }
  return { text, warnings };
}

export function scrubFields(fields: Record<string, string>) {
  const warnings: string[] = [];
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const result = scrubText(value);
    cleaned[key] = result.text;
    warnings.push(...result.warnings);
  }
  return { fields: cleaned, warnings: [...new Set(warnings)] };
}
