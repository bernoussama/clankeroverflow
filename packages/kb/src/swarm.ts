export function swarmSlug(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "swarm"
  );
}

export function swarmPaths(name: string) {
  const slug = swarmSlug(name);
  return {
    slug,
    readme: `swarms/${slug}/README.md`,
    findings: `swarms/${slug}/findings.md`,
    questions: `swarms/${slug}/questions.md`,
  };
}

export function swarmReadme(name: string, goal: string, measure: string) {
  return `# ${name}\n\n## Goal\n\n${goal}\n\n## How to measure\n\n${measure}\n`;
}

export function swarmSeed(kind: "findings" | "questions") {
  const heading = kind === "findings" ? "Findings" : "Questions";
  return `# ${heading}\n\n`;
}

export function assignLine(agent: string, task: string) {
  return `${agent}: ${task}`;
}

export function collectFindings(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

export function memoryLink(name: string) {
  const paths = swarmPaths(name);
  return `Swarm ${paths.slug} is recorded at [[swarms/${paths.slug}/README]]`;
}
