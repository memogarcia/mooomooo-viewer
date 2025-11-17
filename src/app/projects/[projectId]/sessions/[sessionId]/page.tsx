import { SessionDetailPage } from "@/components/dashboard/SessionDetailPage";

type PageProps = {
  params: Promise<{ projectId: string; sessionId: string }>;
};

export default async function SessionPage({ params }: PageProps) {
  const { projectId, sessionId } = await params;
  return <SessionDetailPage projectId={projectId} sessionId={sessionId} />;
}
