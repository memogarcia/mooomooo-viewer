import { NextResponse, type NextRequest } from "next/server";
import { getSessionDetail } from "@/lib/codex";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  try {
    const session = await getSessionDetail(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error(`/api/sessions/${sessionId} error`, error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
