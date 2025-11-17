import { ProjectSessionsPage } from "@/components/dashboard/ProjectSessionsPage";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectSessionsPage projectId={projectId} />;
}
