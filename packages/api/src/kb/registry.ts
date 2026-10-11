import { MemoryObjectStore, TeamKnowledge, type ReviewPolicy } from "@clankeroverflow/kb";

const teams = new Map<string, TeamKnowledge>();

export function knowledgeForTeam(teamId: string, reviewPolicy: ReviewPolicy = "auto") {
  const existing = teams.get(teamId);
  if (existing) return existing;
  const team = new TeamKnowledge(teamId, new MemoryObjectStore(), reviewPolicy);
  teams.set(teamId, team);
  return team;
}

export function resetKnowledgeForTests() {
  teams.clear();
}
