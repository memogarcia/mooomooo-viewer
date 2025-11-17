"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo } from "react";
import type { ProjectSummary } from "@/lib/codex";
import { formatRelative } from "@/lib/formatters";
import { ErrorBanner, Placeholder } from "@/components/ui/Feedback";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json();
};

export function ProjectsOverviewPage() {
  const {
    data: projectsData,
    error,
    isLoading,
  } = useSWR<{ projects: ProjectSummary[] }>("/api/projects", fetcher, { refreshInterval: 15000 });

  const projects = useMemo(() => projectsData?.projects ?? [], [projectsData]);

  const aggregate = useMemo(() => {
    return projects.reduce(
      (totals, project) => {
        totals.totalSessions += project.sessionCount;
        totals.totalTokens += project.totalTokens;
        totals.totalBilledTokens += project.billedTokens;
        return totals;
      },
      { totalTokens: 0, totalBilledTokens: 0, totalSessions: 0 }
    );
  }, [projects]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Projects</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">Codex session viewer</h1>
              <p className="text-sm text-slate-400">Step 1 · Pick a project to inspect its sessions.</p>
            </div>
            {projects.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-right text-sm text-slate-300">
                <p>{projects.length} active projects</p>
                <p>
                  {aggregate.totalSessions} sessions · {aggregate.totalTokens.toLocaleString()} model tokens · {aggregate.totalBilledTokens.toLocaleString()} billed
                </p>
              </div>
            )}
          </div>
        </header>

        {error && <ErrorBanner message="Unable to load projects" />}

        {isLoading && !projects.length && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-32 animate-pulse rounded-3xl border border-white/5 bg-white/5"
              />
            ))}
          </div>
        )}

        {!isLoading && !projects.length && !error && <Placeholder text="No projects tracked yet." large />}

        {!!projects.length && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-3xl border border-white/5 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                  <span>Sessions</span>
                  {project.latestActivityAt && <span>{formatRelative(project.latestActivityAt)}</span>}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white">{project.name}</h2>
                <p className="text-sm text-slate-400 break-all">{project.path}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span>{project.sessionCount} sessions</span>
                  <span>{project.totalTokens.toLocaleString()} model</span>
                  <span>{project.billedTokens.toLocaleString()} billed</span>
                </div>
                <p className="mt-6 inline-flex items-center text-sm font-semibold text-emerald-300">
                  Continue to sessions
                  <span className="ml-2 transition group-hover:translate-x-1">→</span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
