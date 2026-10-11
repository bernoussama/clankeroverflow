export type KbLayer = "personal" | "repo" | "team";

export type DocStatus = "draft" | "verified" | "stale" | "superseded";

export type FixType = "fix" | "howto" | "decision" | "gotcha" | "reference";

export type NoteEntry = {
  text: string;
  metadata: Record<string, string>;
};

export type FixDocument = {
  kind: "fix";
  id: string;
  path: string;
  title: string;
  type: FixType;
  area: string;
  tags: string[];
  aliases: string[];
  errorSignatures: string[];
  status: DocStatus;
  confirmations: number;
  created: string;
  updated: string;
  authors?: string[];
  lastVerified?: string | null;
  supersededBy?: string | null;
  related?: string[];
  problem: string;
  rootCause: string;
  solution: string;
  verification: string;
  notes: string;
};

export type NoteDocument = {
  kind: "note";
  id: string;
  path: string;
  title: string;
  entries: NoteEntry[];
  body: string;
};

export type KbDocument = FixDocument | NoteDocument;

export type SearchHit = {
  id: string;
  path: string;
  layer: KbLayer;
  title: string;
  status: DocStatus | null;
  score: number;
  snippet: string;
  kind: KbDocument["kind"];
};

export type SearchFilters = {
  area?: string;
  tags?: string[];
  type?: FixType;
  status?: DocStatus;
  includeSuperseded?: boolean;
};
