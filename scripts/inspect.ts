import { getProjectSummaries, getSessionsForProject } from "@/lib/codex";

async function main() {
  const projects = await getProjectSummaries();
  console.log("projects", projects.length);
  if (!projects.length) return;
  for (const project of projects.slice(0, 3)) {
    const sessions = await getSessionsForProject(project.id);
    console.log(project.id, project.name, sessions.length);
  }
}

main();
