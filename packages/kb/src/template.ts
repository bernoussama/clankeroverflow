export const AGENTS_MD = `# Knowledge base rules

This directory is a ClankerOverflow knowledge base. It follows Cognition's Agent Memory Repo layout.

## What to write

- Fixes, decisions, how-tos, gotchas, processes, and saved queries.
- One fact per line in notes. Use \`kb_append\` so two writers do not rewrite the file.
- Structured fixes use YAML frontmatter and the sections Problem, Root Cause, Fix, Verification, Notes.

## Frontmatter

- \`type\`: fix, howto, decision, gotcha, or reference.
- \`status\`: draft, verified, stale, or superseded. New writes are drafts.
- \`area\`: free-form folder name, at most two levels. There is no allowed list.
- \`tags\`, \`aliases\`, and \`error_signatures\` are lists.
- \`authors\` records who wrote the doc. An author cannot verify their own doc.
- Provenance on a note line is \`[source: agent/session "one-line message"; added: YYYY-MM-DD]\`.
- Transcripts are optional and off by default. Store them at \`transcripts/{sessionId}.md\`. Search does not index that folder.

## Links and catalogs

- Link with \`[[path]]\` from the knowledge base root. Omit \`.md\`.
- \`MEMORY.md\` is the short entry point. Keep it curated.
- \`index.md\` and \`log.md\` are generated. Do not hand-edit them.

## Swarms

A swarm is a folder:

\`\`\`txt
swarms/{name}/README.md
swarms/{name}/findings.md
swarms/{name}/questions.md
\`\`\`

README states the goal and how to measure it. Findings are one fact per line, including what was ruled out. Questions are lines agents ask each other. Append with \`kb_append\`. When the swarm ends, add one \`[[swarms/{name}/README]]\` link to MEMORY.md.
`;

export const MEMORY_MD = `# Memory

Short entry point for every session. Link the pages worth finding from here.

- Team knowledge lives in area folders. Start with [[AGENTS]] for the writing rules.
`;

export function starterFiles() {
  return [
    { path: "AGENTS.md", body: AGENTS_MD },
    { path: "MEMORY.md", body: MEMORY_MD },
  ] as const;
}
