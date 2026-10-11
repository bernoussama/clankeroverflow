import { formatFixDocument } from "./document";
import { lintDocuments } from "./lint";
import type { IndexedDocument } from "./search";
import type { CatalogChange } from "./catalog";
import type { FixDocument } from "./types";

export type DreamDraft = {
  path: string;
  markdown: string;
  tokens: number;
};

export type DreamPlan = {
  skipped: boolean;
  drafts: DreamDraft[];
  tokens: number;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function draftNote(path: string, line: string) {
  const markdown = `# Dream\n\n- ${line} [source: dream; added: ${new Date().toISOString().slice(0, 10)}]\n`;
  return { path, markdown, tokens: estimateTokens(markdown) };
}

export function planDream(input: {
  documents: IndexedDocument[];
  changes: CatalogChange[];
  tokenBudget: number;
  lastCursor: number;
}): DreamPlan {
  const fresh = input.changes.filter((change) => change.seq > input.lastCursor);
  if (!fresh.length) return { skipped: true, drafts: [], tokens: 0 };

  const drafts: DreamDraft[] = [];
  let tokens = 0;
  const take = (draft: DreamDraft) => {
    if (tokens + draft.tokens > input.tokenBudget) return false;
    drafts.push(draft);
    tokens += draft.tokens;
    return true;
  };

  const nearDuplicate = lintDocuments(input.documents).find(
    (issue) => issue.code === "near-duplicate-area",
  );
  if (nearDuplicate) {
    take(
      draftNote(
        "dreams/area-merge.md",
        `Proposed area merge: ${nearDuplicate.message} [status: draft]`,
      ),
    );
  }

  const recentFixes = input.documents
    .map((item) => item.document)
    .filter((doc): doc is FixDocument => doc.kind === "fix")
    .slice(0, 5);
  if (recentFixes.length) {
    const titles = recentFixes.map((doc) => doc.title).join("; ");
    const note = draftNote("dreams/recent-fixes.md", `Recent fixes to revisit: ${titles}`);
    take(note);
    const sample = recentFixes[0];
    if (sample) {
      const reminder: FixDocument = {
        ...sample,
        id: `dream-${sample.id}`,
        path: `dreams/${sample.path.split("/").at(-1) ?? "reminder.md"}`,
        status: "draft",
        title: `Dream check: ${sample.title}`,
        confirmations: 0,
        authors: ["dream"],
      };
      const markdown = formatFixDocument(reminder);
      take({ path: reminder.path, markdown, tokens: estimateTokens(markdown) });
    }
  }

  return { skipped: false, drafts, tokens };
}
