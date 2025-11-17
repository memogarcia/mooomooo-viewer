"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import type { SessionDetail, SessionSummary } from "@/lib/codex";
import { formatDate, formatRelative } from "@/lib/formatters";
import { Placeholder } from "@/components/ui/Feedback";
import {
  TokenTimelineChart,
  TOKEN_SERIES_META,
  type TokenSeriesKey,
  type ToolCallInsight,
} from "./TokenTimelineChart";

interface SessionDetailProps {
  detail: SessionDetail;
  refreshing: boolean;
}

export const SessionDetailView = ({ detail, refreshing }: SessionDetailProps) => {
  const summary = detail.summary;
  const heroStats = [
    { label: "Used tokens", value: summary.totalTokens, accent: "text-emerald-300" },
    { label: "Cached tokens", value: summary.cachedTokens },
    { label: "Max tokens", value: summary.contextWindow ?? 0 },
  ];

  const breakdownStats = [
    { label: "System tokens", value: summary.cachedTokens },
    { label: "User tokens", value: summary.userTokens },
    { label: "Output tokens", value: summary.outputTokens },
    { label: "Reasoning tokens", value: summary.reasoningTokens },
  ];

  const [focusTimestamp, setFocusTimestamp] = useState<number | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<TokenSeriesKey, boolean>>>({});

  const toolInsights = useMemo<Record<string, ToolCallInsight>>(() => {
    const timeline = [...detail.tokenTimeline].sort((a, b) => a.timestampMs - b.timestampMs);
    if (!timeline.length) {
      return detail.toolCalls.reduce((acc, call) => {
        acc[call.id] = {
          anchorTimestamp: null,
          eventTimestamp: getCallTimestamp(call),
          deltaTokens: null,
        };
        return acc;
      }, {} as Record<string, ToolCallInsight>);
    }

    const deltaByTimestamp = new Map<number, number>();
    for (let i = 1; i < timeline.length; i += 1) {
      const current = timeline[i];
      const previous = timeline[i - 1];
      deltaByTimestamp.set(current.timestampMs, current.totalTokens - previous.totalTokens);
    }

    const fallbackAnchor = timeline[timeline.length - 1]?.timestampMs ?? null;
    return detail.toolCalls.reduce((acc, call) => {
      const eventTimestamp = getCallTimestamp(call);
      const anchorPoint =
        eventTimestamp !== null
          ? timeline.find((point) => point.timestampMs >= eventTimestamp) ?? timeline[timeline.length - 1]
          : timeline[timeline.length - 1];
      acc[call.id] = {
        anchorTimestamp: anchorPoint?.timestampMs ?? fallbackAnchor,
        eventTimestamp,
        deltaTokens: anchorPoint ? deltaByTimestamp.get(anchorPoint.timestampMs) ?? null : null,
      };
      return acc;
    }, {} as Record<string, ToolCallInsight>);
  }, [detail.tokenTimeline, detail.toolCalls]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 border-b border-white/5 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{summary.projectName}</p>
          <h1 className="text-3xl font-semibold text-white">{summary.preview}</h1>
          <p className="text-sm text-slate-400">Session {formatSessionLabel(summary)}</p>
          <p className="text-xs text-slate-500 break-all">{summary.relativePath}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>Started {formatDate(summary.startedAt)}</p>
          <p>Last event {formatRelative(summary.lastActivityAt)}</p>
          {refreshing && <span className="text-emerald-300">Updating...</span>}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {heroStats.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{card.label}</p>
            <p className={clsx("mt-2 text-3xl font-semibold text-white", card.accent)}>
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
        <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tool calls</p>
          <p className="mt-2 text-3xl font-semibold text-white">{detail.toolCalls.length}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {breakdownStats.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        System tokens are approximated from cached input tokens reported by Codex; they capture the instruction/context payload reused across calls.
      </p>

      <div className="full-bleed px-4 sm:px-8">
        <div className="rounded-[32px] border border-white/5 bg-white/5 p-6 shadow-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Token timeline</p>
              <p className="text-xs text-slate-400">
                Hover to inspect system (cached), user, output, and reasoning usage.
              </p>
            </div>
          </div>
          <SeriesToggle
            hiddenSeries={hiddenSeries}
            onToggle={(seriesKey) => setHiddenSeries((prev) => ({ ...prev, [seriesKey]: !prev?.[seriesKey] }))}
          />
          <TokenTimelineChart
            timeline={detail.tokenTimeline}
            toolCalls={detail.toolCalls}
            onSelectTimestamp={(timestamp) => setFocusTimestamp(timestamp)}
            hiddenSeries={hiddenSeries}
            className="h-[440px] w-full sm:h-[520px]"
            toolInsights={toolInsights}
          />
          <p className="mt-3 text-xs text-slate-500">
            Click anywhere on the timeline to jump to the matching chat entry.
          </p>
          <ToolCallActivityRail
            toolCalls={detail.toolCalls}
            toolInsights={toolInsights}
            onSelectTimestamp={(timestamp) => setFocusTimestamp(timestamp)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ToolCallList toolCalls={detail.toolCalls} toolInsights={toolInsights} />
        <MessageList messages={detail.messages} focusTimestamp={focusTimestamp} />
      </div>
    </div>
  );
};

const ToolCallList = ({
  toolCalls,
  toolInsights,
}: {
  toolCalls: SessionDetail["toolCalls"];
  toolInsights: Record<string, ToolCallInsight>;
}) => (
  <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
    <div className="mb-4 flex items-center justify-between">
      <p className="text-sm font-semibold text-white">Tool call timeline</p>
      <p className="text-xs text-slate-400">{toolCalls.length} total</p>
    </div>
    <div className="space-y-3">
      {!toolCalls.length && <Placeholder text="No tool calls yet." />}
      {toolCalls.map((call) => {
        const insight = toolInsights[call.id];
        const delta = typeof insight?.deltaTokens === "number" ? insight.deltaTokens : null;
        const eventLabel = insight?.eventTimestamp
          ? formatDate(new Date(insight.eventTimestamp).toISOString())
          : null;
        return (
          <div key={call.id} className="rounded-2xl border border-white/5 bg-slate-950/50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold text-white">{call.name}</p>
              <span className="text-xs text-slate-400">{eventLabel ?? formatMaybeDate(call.startedAt)}</span>
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{call.toolKind}</p>
            <p className="mt-1 text-xs text-slate-400">Status: {call.status}</p>
            {typeof delta === "number" && (
              <p className="text-xs text-emerald-300">
                Context {delta >= 0 ? "+" : ""}
                {delta.toLocaleString()} tokens
              </p>
            )}
            {call.durationMs !== undefined && (
              <p className="text-xs text-slate-400">Duration: {(call.durationMs / 1000).toFixed(2)}s</p>
            )}
            {call.input && (
              <pre className="mt-2 max-h-24 overflow-y-auto rounded-xl bg-black/40 p-3 text-xs text-emerald-200">
                {truncate(call.input)}
              </pre>
            )}
            {call.output && (
              <pre className="mt-2 max-h-24 overflow-y-auto rounded-xl bg-black/30 p-3 text-xs text-sky-200">
                {truncate(call.output)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const ToolCallActivityRail = ({
  toolCalls,
  toolInsights,
  onSelectTimestamp,
}: {
  toolCalls: SessionDetail["toolCalls"];
  toolInsights: Record<string, ToolCallInsight>;
  onSelectTimestamp: (timestamp: number | null) => void;
}) => {
  if (!toolCalls.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-400">
        Tool insight chips will appear once this session invokes a tool.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Tool call highlights</p>
        <p className="text-xs text-slate-400">Tap a chip to inspect that moment</p>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 pr-1">
        {toolCalls.map((call) => {
          const insight = toolInsights[call.id];
          const timestamp = insight?.eventTimestamp ?? getCallTimestamp(call);
          const timeLabel = timestamp ? formatClock(timestamp) : "Pending";
          const delta = typeof insight?.deltaTokens === "number" ? insight.deltaTokens : null;
          const preview = summarizeCall(call);

          return (
            <button
              key={call.id}
              type="button"
              className="snap-start rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left shadow-lg transition hover:border-white/40"
              onClick={() => onSelectTimestamp(timestamp ?? null)}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="uppercase tracking-[0.3em] text-slate-500">{call.toolKind}</span>
                <span>{timeLabel}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-white">{call.name}</p>
              {typeof delta === "number" && (
                <p className="text-xs text-emerald-300">
                  Context {delta >= 0 ? "+" : ""}
                  {delta.toLocaleString()} tokens
                </p>
              )}
              {preview && <p className="mt-2 max-h-20 overflow-hidden text-xs text-slate-200">{preview}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const MessageList = ({
  messages,
  focusTimestamp,
}: {
  messages: SessionDetail["messages"];
  focusTimestamp: number | null;
}) => {
  const focusMessageId = useMemo(() => {
    if (!focusTimestamp || !messages.length) return null;
    for (const message of messages) {
      const messageTime = new Date(message.timestamp).getTime();
      if (messageTime >= focusTimestamp) {
        return message.id;
      }
    }
    return messages[messages.length - 1]?.id ?? null;
  }, [messages, focusTimestamp]);

  useEffect(() => {
    if (!focusMessageId) return;
    const el = document.getElementById(`message-${focusMessageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusMessageId]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Conversation timeline</p>
        <p className="text-xs text-slate-400">{messages.length} entries</p>
      </div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
        {!messages.length && <Placeholder text="No chat activity yet." />}
        {messages.map((message) => {
          const isFocused = focusMessageId === message.id;
          return (
            <div
              key={message.id}
              id={`message-${message.id}`}
              className={clsx(
                "rounded-2xl border border-white/5 bg-slate-950/40 px-4 py-3 transition",
                isFocused && "border-sky-400/70 bg-slate-900/70 shadow-sky-500/20"
              )}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="uppercase tracking-[0.3em] text-slate-500">{message.role}</span>
                <span>{formatDate(message.timestamp)}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-white">{message.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const truncate = (value: string, max = 320) => (value.length > max ? `${value.slice(0, max)}...` : value);

const formatMaybeDate = (value?: string) => (value ? formatDate(value) : "Pending");

const formatSessionLabel = (summary: SessionSummary) => {
  const filename = summary.relativePath.split("/").pop() ?? summary.relativePath;
  return filename.replace(/\.jsonl$/, "");
};

const getCallTimestamp = (call: SessionDetail["toolCalls"][number]) => {
  const candidates = [call.completedAt, call.startedAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ms = new Date(candidate).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
};

const formatClock = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const summarizeCall = (call: SessionDetail["toolCalls"][number]) => {
  const raw = typeof call.output === "string" && call.output.trim().length
    ? call.output
    : typeof call.input === "string"
      ? call.input
      : null;
  if (!raw) return null;
  return truncate(raw, 200);
};

const SeriesToggle = ({
  hiddenSeries,
  onToggle,
}: {
  hiddenSeries: Partial<Record<TokenSeriesKey, boolean>>;
  onToggle: (seriesKey: TokenSeriesKey) => void;
}) => (
  <div className="mb-4 flex flex-wrap gap-2">
    {TOKEN_SERIES_META.map((series) => {
      const active = !hiddenSeries[series.key];
      return (
        <button
          key={series.key}
          type="button"
          onClick={() => onToggle(series.key)}
          className={clsx(
            "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
            active
              ? "border-white/40 bg-white/10 text-white"
              : "border-white/10 bg-transparent text-slate-400"
          )}
          aria-pressed={active}
        >
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: series.color, opacity: active ? 1 : 0.35 }}
          />
          {series.label}
        </button>
      );
    })}
  </div>
);
