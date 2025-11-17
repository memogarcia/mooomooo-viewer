import { NextResponse } from "next/server";
import { getProjectSummaries } from "@/lib/codex";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const projects = await getProjectSummaries();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("/api/projects error", error);
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}
