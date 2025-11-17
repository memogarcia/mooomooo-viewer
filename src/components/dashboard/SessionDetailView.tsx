"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionDetail, SessionSummary, TokenDelta } from "@/lib/codex";
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

type ContextRange = { before: number; after: number };

type TelemetryEvent = {
  id: string;
  timestamp: string;
  timestampMs: number;
  kind: "tool" | "file" | "user" | "agent";
  title: string;
  subtitle?: string;
  deltaTokens?: TokenDelta | null;
  contextRange?: ContextRange | null;
  snippet?: string | null;
};

export const SessionDetailView = ({ detail, refreshing }: SessionDetailProps) => {
  const summary = detail.summary;
  const heroStats = [
    { label: "Model tokens", value: summary.totalTokens, accent: "text-emerald-300" },
    { label: "Billed tokens", value: summary.billedTokens, accent: "text-sky-300" },
    { label: "Reused tokens", value: summary.cachedTokens },
    { label: "Context window", value: summary.contextWindow ?? 0 },
  ];

  const breakdownStats = [
    { label: "Reused tokens (cached)", value: summary.cachedTokens },
    { label: "User tokens", value: summary.userTokens },
    { label: "Output tokens", value: summary.outputTokens },
    { label: "Reasoning tokens", value: summary.reasoningTokens },
  ];

  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
  const [hoverTimestamp, setHoverTimestamp] = useState<number | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<TokenSeriesKey, boolean>>>({});
  const [hiddenEventKinds, setHiddenEventKinds] = useState<Partial<Record<TelemetryEvent["kind"], boolean>>>({});

  const sortedTimeline = useMemo(
    () => [...detail.tokenTimeline].sort((a, b) => a.timestampMs - b.timestampMs),
    [detail.tokenTimeline]
  );

  const { toolInsights, deltaLookup } = useMemo(() => {
    const timeline = sortedTimeline;
    if (!timeline.length) {
      const emptyInsights = detail.toolCalls.reduce((acc, call) => {
        acc[call.id] = {
          anchorTimestamp: null,
          eventTimestamp: getCallTimestamp(call),
          deltaTokens: null,
        };
        return acc;
      }, {} as Record<string, ToolCallInsight>);
      return { toolInsights: emptyInsights, deltaLookup: new Map<number, TokenDelta | null>() };
    }

    const deltaByTimestamp = new Map<number, TokenDelta | null>();
    for (let i = 0; i < timeline.length; i += 1) {
      const current = timeline[i];
      const previous = i > 0 ? timeline[i - 1] : undefined;
      deltaByTimestamp.set(current.timestampMs, deriveDeltaFromPoints(current, previous));
    }

    const fallbackAnchor = timeline[timeline.length - 1]?.timestampMs ?? null;
    const insights = detail.toolCalls.reduce((acc, call) => {
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

    return { toolInsights: insights, deltaLookup: deltaByTimestamp };
  }, [detail.toolCalls, sortedTimeline]);

  const timelineEvents = useMemo(
    () => buildTimelineEvents(detail, toolInsights, deltaLookup, sortedTimeline),
    [detail, toolInsights, deltaLookup, sortedTimeline]
  );
  const fallbackTimestamp = useMemo(() => {
    return timelineEvents[0]?.timestampMs ?? detail.tokenTimeline[0]?.timestampMs ?? null;
  }, [detail.tokenTimeline, timelineEvents]);
  const resolvedTimestamp = activeTimestamp ?? fallbackTimestamp;

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

      <div className="mx-auto w-full max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
      </div>

      <div className="mx-auto w-full max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {breakdownStats.map((card) => (
            <div key={card.label} className="rounded-2xl border border-white/5 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{card.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Reused tokens come from cached input tokens reported by Codex and include both persistent system instructions and repeated user/tool context.
      </p>

      <div className="full-bleed px-4 sm:px-8">
        <div className="rounded-[32px] border border-white/5 bg-white/5 p-6 shadow-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Token timeline</p>
              <p className="text-xs text-slate-400">
                Hover to inspect reused (cached), user, output, and reasoning usage.
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
            onSelectTimestamp={(timestamp) => setActiveTimestamp(timestamp)}
            onHoverTimestamp={setHoverTimestamp}
            activeTimestamp={resolvedTimestamp}
            hiddenSeries={hiddenSeries}
            className="h-[520px] w-full"
            toolInsights={toolInsights}
          />
          <p className="mt-3 text-xs text-slate-500">
            Click anywhere on the timeline to jump to the matching chat entry.
          </p>
          <TelemetryTimeline
            events={timelineEvents}
            activeTimestamp={resolvedTimestamp}
            hoverTimestamp={hoverTimestamp}
            onEventSelect={(timestamp) => setActiveTimestamp(timestamp)}
            onVisibleEventChange={(timestamp) => setActiveTimestamp(timestamp)}
            hiddenKinds={hiddenEventKinds}
            onToggleKind={(kind) => setHiddenEventKinds((prev) => ({ ...prev, [kind]: !prev?.[kind] }))}
          />
        </div>
      </div>

      <div className="full-bleed px-4 sm:px-8">
        <MessageList
          messages={detail.messages}
          activeTimestamp={resolvedTimestamp}
          hiddenKinds={hiddenEventKinds}
        />
      </div>
    </div>
  );
};

const TelemetryTimeline = ({
  events,
  activeTimestamp,
  hoverTimestamp,
  onEventSelect,
  onVisibleEventChange,
  hiddenKinds,
  onToggleKind,
}: {
  events: TelemetryEvent[];
  activeTimestamp: number | null;
  hoverTimestamp: number | null;
  onEventSelect: (timestamp: number | null) => void;
  onVisibleEventChange: (timestamp: number | null) => void;
  hiddenKinds?: Partial<Record<TelemetryEvent["kind"], boolean>>;
  onToggleKind: (kind: TelemetryEvent["kind"]) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const autoScrolling = useRef(false);
  const rafRef = useRef<number>();
  const releaseTimeoutRef = useRef<number | null>(null);
  const lastUserDrivenTimestamp = useRef<number | null>(null);
  const filteredEvents = useMemo(
    () => events.filter((event) => !hiddenKinds?.[event.kind]),
    [events, hiddenKinds]
  );

  const eventsById = useMemo(() => {
    const map = new Map<string, TelemetryEvent>();
    filteredEvents.forEach((event) => map.set(event.id, event));
    return map;
  }, [filteredEvents]);

  const findClosestEvent = useCallback(
    (timestamp: number | null) => {
      if (timestamp === null || !filteredEvents.length) return null;
      let closest: TelemetryEvent | null = null;
      for (const event of filteredEvents) {
        if (!closest || Math.abs(event.timestampMs - timestamp) < Math.abs(closest.timestampMs - timestamp)) {
          closest = event;
        }
      }
      return closest;
    },
    [filteredEvents]
  );

  const scrollToTimestamp = useCallback(
    (timestamp: number | null) => {
      const target = findClosestEvent(timestamp);
      if (!target) return;
      const node = cardRefs.current.get(target.id);
      const container = containerRef.current;
      if (!node || !container) return;
      autoScrolling.current = true;
      if (releaseTimeoutRef.current) {
        window.clearTimeout(releaseTimeoutRef.current);
      }
      node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      releaseTimeoutRef.current = window.setTimeout(() => {
        autoScrolling.current = false;
        releaseTimeoutRef.current = null;
      }, 380);
    },
    [findClosestEvent]
  );

  useEffect(() => {
    if (activeTimestamp === null) return;
    if (lastUserDrivenTimestamp.current === activeTimestamp) {
      lastUserDrivenTimestamp.current = null;
      return;
    }
    scrollToTimestamp(activeTimestamp);
  }, [activeTimestamp, scrollToTimestamp]);

  const reportCenterEvent = useCallback(() => {
    if (autoScrolling.current) return;
    const container = containerRef.current;
    if (!container || !filteredEvents.length) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closestId: string | null = null;
    let closestDist = Infinity;
    cardRefs.current.forEach((node, id) => {
      const cardCenter = node.offsetLeft + node.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    });
    if (closestId) {
      const event = eventsById.get(closestId);
      if (event) {
        const shouldNotify = activeTimestamp === null || Math.abs(event.timestampMs - activeTimestamp) > 1;
        if (shouldNotify) {
          lastUserDrivenTimestamp.current = event.timestampMs;
          onVisibleEventChange(event.timestampMs);
        }
      }
    }
  }, [activeTimestamp, eventsById, filteredEvents.length, onVisibleEventChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(reportCenterEvent);
    };
    container.addEventListener("scroll", onScroll);
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (releaseTimeoutRef.current) {
        window.clearTimeout(releaseTimeoutRef.current);
      }
    };
  }, [reportCenterEvent]);

  const setCardRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (!node) {
      cardRefs.current.delete(id);
    } else {
      cardRefs.current.set(id, node);
    }
  }, []);

  const highlightTimestamp = hoverTimestamp ?? activeTimestamp;

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Timeline</p>
          <p className="text-xs text-slate-400">Tool calls, files, and chat events · Scroll ↔︎ to scrub</p>
        </div>
        <EventKindToggle hiddenKinds={hiddenKinds ?? {}} onToggle={onToggleKind} />
      </div>
      {filteredEvents.length ? (
        <div
          ref={containerRef}
          className="relative flex snap-x gap-4 overflow-x-auto pb-6 pr-2"
        >
          <div className="pointer-events-none absolute left-0 top-1/2 -z-10 h-px w-full -translate-y-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          {filteredEvents.map((event) => {
            const isActive = highlightTimestamp !== null && Math.abs(event.timestampMs - highlightTimestamp) < 5000;
            const meta = TIMELINE_KIND_META[event.kind];
            return (
              <button
                key={event.id}
                ref={(node) => setCardRef(event.id, node)}
                type="button"
                className={clsx(
                  "snap-center rounded-[28px] border px-5 py-4 text-left transition focus:outline-none",
                  "min-w-[260px] max-w-xs bg-slate-950/60 shadow-[0_20px_45px_rgba(15,23,42,0.45)]",
                  isActive ? "border-sky-300/70" : "border-white/10 hover:border-white/30"
                )}
                onClick={() => {
                  lastUserDrivenTimestamp.current = event.timestampMs;
                  onEventSelect(event.timestampMs);
                }}
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-2 uppercase tracking-[0.3em] text-slate-500">
                    <span
                      className={clsx(
                        "inline-flex h-2.5 w-2.5 rounded-full",
                        meta.dotClass
                      )}
                    />
                    {meta.label}
                  </span>
                  <span>{formatClock(event.timestampMs)}</span>
                </div>
                <p className="mt-2 text-base font-semibold text-white">{event.title}</p>
                {event.subtitle && <p className="text-xs text-slate-400">{event.subtitle}</p>}
                {event.deltaTokens ? (
                  <p className="mt-1 text-xs text-emerald-300">
                    Context {formatTokenDelta(event.deltaTokens, event.contextRange)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Context change shown earlier this turn.</p>
                )}
                {event.snippet && (
                  <p className="mt-3 line-clamp-3 text-sm text-slate-200">{event.snippet}</p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-slate-400">
          No telemetry events match the current filters.
        </div>
      )}
    </div>
  );
};

const MessageList = ({
  messages,
  activeTimestamp,
  hiddenKinds,
}: {
  messages: SessionDetail["messages"];
  activeTimestamp: number | null;
  hiddenKinds: Partial<Record<TelemetryEvent["kind"], boolean>>;
}) => {
  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        if (message.role === "user" && hiddenKinds.user) return false;
        if (message.role === "assistant" && hiddenKinds.agent) return false;
        return true;
      }),
    [messages, hiddenKinds]
  );

  const focusMessageId = useMemo(() => {
    if (activeTimestamp === null || !filteredMessages.length) return null;
    for (const message of filteredMessages) {
      const messageTime = new Date(message.timestamp).getTime();
      if (messageTime >= activeTimestamp) {
        return message.id;
      }
    }
    return filteredMessages[filteredMessages.length - 1]?.id ?? null;
  }, [filteredMessages, activeTimestamp]);

  useEffect(() => {
    if (!focusMessageId) return;
    const el = document.getElementById(`message-${focusMessageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusMessageId]);

  return (
    <div className="rounded-[32px] border border-white/5 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Conversation timeline</p>
        <p className="text-xs text-slate-400">{messages.length} entries</p>
      </div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
        {!filteredMessages.length && <Placeholder text="No chat activity for selected filters." />}
        {filteredMessages.map((message) => {
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

const deriveDeltaFromPoints = (
  current: SessionDetail["tokenTimeline"][number],
  previous?: SessionDetail["tokenTimeline"][number]
): TokenDelta | null => {
  if (current.delta) return current.delta;
  if (!previous) return null;
  return {
    totalTokens: current.totalTokens - previous.totalTokens,
    inputTokens: current.inputTokens - previous.inputTokens,
    cachedTokens: current.cachedTokens - previous.cachedTokens,
    userTokens: current.userTokens - previous.userTokens,
    outputTokens: current.outputTokens - previous.outputTokens,
    reasoningTokens: current.reasoningTokens - previous.reasoningTokens,
    billedTokens: current.billedTokens - previous.billedTokens,
  };
};

const formatTokenDelta = (delta?: TokenDelta | null, range?: ContextRange | null) => {
  if (!delta) return "Δ";
  const total = delta.totalTokens ?? 0;
  const prefix = total >= 0 ? "+" : "";
  const changeText = `${prefix}${total.toLocaleString()} tokens`;
  const breakdownSegments = [
    { label: "User", value: delta.userTokens },
    { label: "Reused", value: delta.cachedTokens },
    { label: "Output", value: delta.outputTokens },
    { label: "Reasoning", value: delta.reasoningTokens },
  ]
    .filter((segment) => segment.value)
    .map((segment) => `${segment.label} ${segment.value >= 0 ? "+" : ""}${segment.value.toLocaleString()}`);
  const rangeText =
    range && typeof range.before === "number" && typeof range.after === "number"
      ? `${range.before.toLocaleString()} → ${range.after.toLocaleString()}`
      : "Δ";
  const detail = [changeText, ...breakdownSegments].join(" · ");
  return `${rangeText} (${detail})`;
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

const EventKindToggle = ({
  hiddenKinds,
  onToggle,
}: {
  hiddenKinds: Partial<Record<TelemetryEvent["kind"], boolean>>;
  onToggle: (kind: TelemetryEvent["kind"]) => void;
}) => (
  <div className="mb-4 flex flex-wrap gap-2">
    {(Object.keys(TIMELINE_KIND_META) as TelemetryEvent["kind"][]).map((kind) => {
      const meta = TIMELINE_KIND_META[kind];
      const active = !hiddenKinds[kind];
      return (
        <button
          key={kind}
          type="button"
          onClick={() => onToggle(kind)}
          className={clsx(
            "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
            active ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-transparent text-slate-400"
          )}
          aria-pressed={active}
        >
          <span className={clsx("inline-flex h-2.5 w-2.5 rounded-full", TIMELINE_KIND_META[kind].dotClass)} />
          {meta.label}
        </button>
      );
    })}
  </div>
);

const buildTimelineEvents = (
  detail: SessionDetail,
  toolInsights: Record<string, ToolCallInsight>,
  deltaLookup: Map<number, TokenDelta | null>,
  timeline: SessionDetail["tokenTimeline"]
): TelemetryEvent[] => {
  const fallbackTimelinePoint = timeline[timeline.length - 1];
  const summaryFallback = new Date(detail.summary.lastActivityAt).getTime();
  const safeFallbackTimestamp = Number.isNaN(summaryFallback)
    ? Date.now()
    : summaryFallback;
  const consumedAnchors = new Set<number>();

  const registerDelta = (
    delta: TokenDelta | null,
    anchorPoint: SessionDetail["tokenTimeline"][number] | null
  ) => {
    if (!delta) return { delta: null, range: null } as const;
    const anchorTimestamp = anchorPoint?.timestampMs ?? null;
    if (anchorTimestamp && consumedAnchors.has(anchorTimestamp)) {
      return { delta: null, range: null } as const;
    }
    if (anchorTimestamp) consumedAnchors.add(anchorTimestamp);
    const after = anchorPoint?.totalTokens ?? null;
    const before = after !== null ? after - delta.totalTokens : null;
    return {
      delta,
      range: before !== null && after !== null ? { before, after } : null,
    } as const;
  };

  const toolEvents: TelemetryEvent[] = detail.toolCalls.map((call) => {
    const insight = toolInsights[call.id];
    const rawTimestamp =
      insight?.eventTimestamp ??
      getCallTimestamp(call) ??
      fallbackTimelinePoint?.timestampMs ??
      safeFallbackTimestamp;
    const timestampMs = Number.isNaN(rawTimestamp) ? safeFallbackTimestamp : rawTimestamp;
    const resolvedAnchorTimestamp = insight?.anchorTimestamp ?? null;
    const resolvedAnchorPoint = resolvedAnchorTimestamp
      ? timeline.find((point) => point.timestampMs === resolvedAnchorTimestamp)
      : anchorPoint;
    const fallbackDeltaInfo = estimateDeltaForTimestamp(timestampMs, timeline, deltaLookup);
    const registered = registerDelta(
      insight?.deltaTokens ?? fallbackDeltaInfo.delta,
      resolvedAnchorPoint ?? fallbackDeltaInfo.anchorPoint
    );
    return {
      id: `tool-${call.id}`,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      kind: "tool",
      title: call.name,
      subtitle: `${call.toolKind} · ${call.status}`,
      deltaTokens: registered.delta,
      contextRange: registered.range,
      snippet: summarizeCall(call),
    } satisfies TelemetryEvent;
  });

  const fileEvents = detail.messages
    .map((message) => buildFileEvent(message))
    .filter((event): event is TelemetryEvent => Boolean(event));

  const conversationEvents = detail.messages
    .map((message) => buildConversationEvent(message, timeline, deltaLookup, registerDelta))
    .filter((event): event is TelemetryEvent => Boolean(event));

  return [...toolEvents, ...fileEvents, ...conversationEvents].sort((a, b) => a.timestampMs - b.timestampMs);
};

const buildFileEvent = (message: SessionDetail["messages"][number]): TelemetryEvent | null => {
  if (message.kind !== "status") return null;
  const text = message.text ?? "";
  if (!looksLikeFileEvent(text)) return null;
  const timestampMs = new Date(message.timestamp).getTime();
  if (Number.isNaN(timestampMs)) return null;
  const action = extractFileAction(text);
  const path = extractFilePath(text);
  return {
    id: `file-${message.id}`,
    timestamp: message.timestamp,
    timestampMs,
    kind: "file",
    title: path ?? action ?? "File event",
    subtitle: action ?? "File activity",
    snippet: text,
  } satisfies TelemetryEvent;
};

const FILE_EVENT_PATTERNS = [
  /reading file/i,
  /read file/i,
  /opened file/i,
  /loading file/i,
  /saved file/i,
  /wrote file/i,
  /writ(?:ing)? file/i,
];

const looksLikeFileEvent = (text: string) => FILE_EVENT_PATTERNS.some((pattern) => pattern.test(text));

const extractFileAction = (text: string) => {
  if (/reading file/i.test(text)) return "Reading file";
  if (/read file/i.test(text)) return "Read file";
  if (/opened file/i.test(text)) return "Opened file";
  if (/saved file/i.test(text)) return "Saved file";
  if (/writ(?:ing)? file/i.test(text)) return "Writing file";
  if (/loading file/i.test(text)) return "Loading file";
  return undefined;
};

const extractFilePath = (text: string) => {
  const inline = text.match(/`([^`]+)`|"([^"]+)"|'([^']+)'/);
  if (inline) {
    return (inline[1] ?? inline[2] ?? inline[3])?.trim();
  }
  const afterColon = text.match(/file[:\s]+([^\s]+)/i);
  if (afterColon) {
    return afterColon[1]?.trim();
  }
  const pathLike = text.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
  return pathLike?.[1];
};

const buildConversationEvent = (
  message: SessionDetail["messages"][number],
  timeline: SessionDetail["tokenTimeline"],
  deltaLookup: Map<number, TokenDelta | null>,
  registerDelta: (
    delta: TokenDelta | null,
    anchorPoint: SessionDetail["tokenTimeline"][number] | null
  ) => { delta: TokenDelta | null; range: ContextRange | null }
): TelemetryEvent | null => {
  if (message.kind !== "text") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  const timestampMs = new Date(message.timestamp).getTime();
  if (Number.isNaN(timestampMs)) return null;
  const kind = message.role === "user" ? ("user" as const) : ("agent" as const);
  const title = extractHeadline(message.text);
  const deltaInfo = estimateDeltaForTimestamp(timestampMs, timeline, deltaLookup);
  const registered = registerDelta(deltaInfo.delta, deltaInfo.anchorPoint);
  return {
    id: `msg-${message.id}`,
    timestamp: message.timestamp,
    timestampMs,
    kind,
    title,
    subtitle: kind === "user" ? "User input" : "Agent response",
    snippet: message.text,
    deltaTokens: registered.delta,
    contextRange: registered.range,
  } satisfies TelemetryEvent;
};

const extractHeadline = (text: string) => {
  const firstLine = text.trim().split(/\n+/)[0] ?? "";
  if (!firstLine) return "Conversation";
  return truncate(firstLine, 120);
};

const estimateDeltaForTimestamp = (
  timestampMs: number,
  timeline: SessionDetail["tokenTimeline"],
  deltaLookup: Map<number, TokenDelta | null>
) => {
  if (!timeline.length) {
    return { delta: null, anchorPoint: null } as const;
  }
  let closestIndex = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < timeline.length; i += 1) {
    const diff = Math.abs(timeline[i].timestampMs - timestampMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }

  const candidateIndices = [closestIndex, closestIndex - 1, closestIndex + 1, closestIndex + 2];
  for (const index of candidateIndices) {
    if (index < 0 || index >= timeline.length) continue;
    const candidatePoint = timeline[index];
    const delta = deltaLookup.get(candidatePoint.timestampMs);
    if (delta) {
      return { delta, anchorPoint: candidatePoint } as const;
    }
  }
  return { delta: null, anchorPoint: null } as const;
};

const TIMELINE_KIND_META: Record<TelemetryEvent["kind"], { label: string; dotClass: string }> = {
  tool: { label: "tool", dotClass: "bg-sky-300" },
  file: { label: "file", dotClass: "bg-emerald-300" },
  user: { label: "user", dotClass: "bg-rose-300" },
  agent: { label: "agent", dotClass: "bg-indigo-300" },
};
