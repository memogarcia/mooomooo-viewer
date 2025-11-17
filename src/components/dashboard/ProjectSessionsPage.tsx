"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo } from "react";
import type { ProjectSummary, SessionSummary } from "@/lib/codex";
import { formatDate, formatRelative } from "@/lib/formatters";
import { ErrorBanner, Placeholder } from "@/components/ui/Feedback";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json();
};

interface Props {
  projectId: string;
}

export function ProjectSessionsPage({ projectId }: Props) {
  const { data: projectsData } = useSWR<{ projects: ProjectSummary[] }>("/api/projects", fetcher, {
    refreshInterval: 30000,
  });
  const {
    data: sessionsData,
    error,
    isLoading,
  } = useSWR<{ sessions: SessionSummary[] }>(`/api/projects/${projectId}/sessions`, fetcher, {
    refreshInterval: 12000,
  });

  const project = useMemo(
    () => projectsData?.projects.find((item) => item.id === projectId),
    [projectsData, projectId]
  );

  const sessions = useMemo(() => {
    const raw = sessionsData?.sessions ?? [];
    return [...raw].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  }, [sessionsData]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/" className="text-white hover:underline">
            Projects
          </Link>
          <span>/</span>
          <span className="text-slate-400">{project?.name ?? projectId}</span>
        </div>
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Sessions</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">{project?.name ?? "Project sessions"}</h1>
              <p className="text-sm text-slate-400">Step 2 · Choose a session to inspect in detail.</p>
            </div>
            {project && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-right text-sm text-slate-300">
                <p>{project.sessionCount} sessions tracked</p>
                {project.latestActivityAt && <p>Active {formatRelative(project.latestActivityAt)}</p>}
                <p>
                  {project.totalTokens.toLocaleString()} model · {project.billedTokens.toLocaleString()} billed
                </p>
              </div>
            )}
          </div>
        </header>

        {error && <ErrorBanner message="Unable to load sessions" />}

        {!project && !projectsData && <Placeholder text="Loading project info..." />}

        <div className="grid gap-4">
          {!sessions.length && !isLoading && project && <Placeholder text="No sessions for this project yet." />}

          {isLoading && !sessions.length && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-24 animate-pulse rounded-3xl border border-white/5 bg-white/5" />
              ))}
            </div>
          )}

          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/projects/${projectId}/sessions/${session.id}`}
              className="rounded-3xl border border-white/5 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <p className="uppercase tracking-[0.3em]">{session.id.slice(0, 8)}</p>
                <p>{formatRelative(session.lastActivityAt)}</p>
              </div>
              <p className="mt-2 text-lg font-semibold text-white">{session.preview}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                <span>Started {formatDate(session.startedAt)}</span>
                <span>{session.totalTokens.toLocaleString()} model</span>
                <span>{session.billedTokens.toLocaleString()} billed</span>
                <span>{session.toolCallCount} tool calls</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
