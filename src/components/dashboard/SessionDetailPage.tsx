"use client";

import Link from "next/link";
import useSWR from "swr";
import type { SessionDetail } from "@/lib/codex";
import { ErrorBanner, Placeholder } from "@/components/ui/Feedback";
import { SessionDetailView } from "./SessionDetailView";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json();
};

interface Props {
  projectId: string;
  sessionId: string;
}

export function SessionDetailPage({ projectId, sessionId }: Props) {
  const {
    data,
    error,
    isLoading,
  } = useSWR<{ session: SessionDetail }>(`/api/sessions/${sessionId}`, fetcher, {
    refreshInterval: 4000,
  });

  const detail = data?.session ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-12">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <Link href="/" className="text-white hover:underline">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="text-white hover:underline">
            {detail?.summary.projectName ?? "Project"}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Session</span>
        </nav>
        {error && <ErrorBanner message="Unable to load session data" />}
        {isLoading && !detail && <Placeholder text="Loading session..." large />}
        {detail && <SessionDetailView detail={detail} refreshing={isLoading} />}
      </main>
    </div>
  );
}
