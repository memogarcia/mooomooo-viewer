import { NextResponse, type NextRequest } from "next/server";
import { getSessionsForProject } from "@/lib/codex";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  if (!projectId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  try {
    const sessions = await getSessionsForProject(projectId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error(`/api/projects/${projectId}/sessions error`, error);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}
