"use client";

import {
  Area,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
  Legend,
} from "recharts";
import type { TokenTimelinePoint, ToolCall } from "@/lib/codex";
import { useMemo, useState } from "react";
import clsx from "clsx";

const palette = {
  cached: "#818cf8",
  user: "#22d3ee",
  output: "#f472b6",
  reasoning: "#facc15",
};

export const TOKEN_SERIES_META: Array<{ key: TokenSeriesKey; label: string; color: string }> = [
  { key: "cached", label: "System (cached)", color: palette.cached },
  { key: "user", label: "User", color: palette.user },
  { key: "output", label: "Output", color: palette.output },
  { key: "reasoning", label: "Reasoning", color: palette.reasoning },
];

export type ToolCallInsight = {
  anchorTimestamp: number | null;
  eventTimestamp: number | null;
  deltaTokens: number | null;
};

const formatTime = (value: number) => {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export type TokenSeriesKey = "cached" | "user" | "output" | "reasoning";

interface TokenTimelineChartProps {
  timeline: TokenTimelinePoint[];
  toolCalls: ToolCall[];
  onSelectTimestamp?: (timestamp: number | null) => void;
  hiddenSeries?: Partial<Record<TokenSeriesKey, boolean>>;
  className?: string;
  toolInsights?: Record<string, ToolCallInsight>;
}

type ChartDatum = {
  time: number;
  label: string;
  cached: number;
  user: number;
  output: number;
  reasoning: number;
  total: number;
  contextWindow?: number;
};

type ToolMarker = {
  markerType: "tool";
  time: number;
  displayTime: number | null;
  name: string;
  status: string;
  callId: string;
  infoSnippet?: string | null;
  contextDelta?: number | null;
};

type ChartPointerState = {
  activePayload?: Array<{ payload?: unknown }>;
};

export function TokenTimelineChart({
  timeline,
  toolCalls,
  onSelectTimestamp,
  hiddenSeries,
  className,
  toolInsights,
}: TokenTimelineChartProps) {
  const [hoverTimelinePoint, setHoverTimelinePoint] = useState<ChartDatum | null>(null);
  const [hoverToolMarker, setHoverToolMarker] = useState<ToolMarker | null>(null);
  const chartData = useMemo(
    () =>
      timeline.map<ChartDatum>((point) => ({
        time: point.timestampMs,
        label: point.timestamp,
        cached: point.cachedTokens,
        user: point.userTokens,
        output: point.outputTokens,
        reasoning: point.reasoningTokens,
        total: point.totalTokens,
        contextWindow: point.contextWindow,
      })),
    [timeline]
  );

  const [domainStart, domainEnd] = useMemo(() => {
    if (!chartData.length) return [null, null] as const;
    const start = chartData[0].time;
    const end = chartData[chartData.length - 1].time;
    return [start, end] as const;
  }, [chartData]);

  const toolMarkers = useMemo(
    () =>
      toolCalls
        .map<ToolMarker | null>((call) => {
          const anchorMs = toMs(toolInsights?.[call.id]?.anchorTimestamp ?? null, call);
          const displayMs = toMs(toolInsights?.[call.id]?.eventTimestamp ?? null, call);
          if (anchorMs === null && displayMs === null) return null;
          const time = clampToDomain(anchorMs ?? displayMs, domainStart, domainEnd);
          if (time === null) return null;
          return {
            markerType: "tool" as const,
            time,
            displayTime: displayMs ?? time,
            name: call.name,
            status: call.status,
            callId: call.id,
            infoSnippet: pickSnippet(call),
            contextDelta: toolInsights?.[call.id]?.deltaTokens ?? null,
          } satisfies ToolMarker;
        })
        .filter((marker): marker is ToolMarker => Boolean(marker)),
    [toolCalls, toolInsights, domainStart, domainEnd]
  );

  if (!chartData.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-sm text-slate-200">
        Token usage data will appear once Codex has reported at least one call for this session.
      </div>
    );
  }

  return (
    <div className={clsx("h-[360px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ left: 0, right: 20, top: 10, bottom: 10 }}
          onMouseMove={(state) => {
            const pointer = state as ChartPointerState | undefined;
            const payloads = pointer?.activePayload ?? [];
            const timelineEntry = payloads.find((entry) => isChartDatum(entry.payload))?.payload as ChartDatum | undefined;
            const toolEntry = payloads.find((entry) => isToolMarker(entry.payload))?.payload as ToolMarker | undefined;
            setHoverTimelinePoint(timelineEntry ?? null);
            setHoverToolMarker(toolEntry ?? null);
          }}
          onMouseLeave={() => {
            setHoverTimelinePoint(null);
            setHoverToolMarker(null);
          }}
          onClick={() => {
            if (!onSelectTimestamp) return;
            const timestamp = hoverTimelinePoint?.time ?? hoverToolMarker?.displayTime ?? hoverToolMarker?.time;
            if (!timestamp) return;
            onSelectTimestamp(timestamp);
          }}
        >
          <defs>
            {Object.entries(palette).map(([key, color]) => (
              <linearGradient id={`gradient-${key}`} key={key} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                <stop offset="100%" stopColor={color} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            tickFormatter={formatTime}
            stroke="#cbd5f5"
            tick={{ fill: "#cbd5f5" }}
            domain={["dataMin", "dataMax"]}
          />
          <YAxis
            yAxisId="tokens"
            tickFormatter={(value) => `${value}`}
            stroke="#cbd5f5"
            tick={{ fill: "#cbd5f5" }}
            width={60}
          />
          <YAxis yAxisId="tool" type="number" domain={[0, 1]} hide />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
            content={(props) => (
              <TokenTooltip
                {...props}
                hiddenSeries={hiddenSeries}
                fallbackPoint={hoverTimelinePoint}
                fallbackToolCall={hoverToolMarker}
              />
            )}
          />
          <Legend wrapperStyle={{ color: "#cbd5f5" }} />
          <Area
            dataKey="cached"
            yAxisId="tokens"
            stackId="tokens"
            stroke={palette.cached}
            fill="url(#gradient-cached)"
            name="System (cached)"
            hide={Boolean(hiddenSeries?.cached)}
          />
          <Area
            dataKey="user"
            yAxisId="tokens"
            stackId="tokens"
            stroke={palette.user}
            fill="url(#gradient-user)"
            name="User"
            hide={Boolean(hiddenSeries?.user)}
          />
          <Area
            dataKey="output"
            yAxisId="tokens"
            stackId="tokens"
            stroke={palette.output}
            fill="url(#gradient-output)"
            name="Output"
            hide={Boolean(hiddenSeries?.output)}
          />
          <Area
            dataKey="reasoning"
            yAxisId="tokens"
            stackId="tokens"
            stroke={palette.reasoning}
            fill="url(#gradient-reasoning)"
            name="Reasoning"
            hide={Boolean(hiddenSeries?.reasoning)}
          />
          <Scatter
            yAxisId="tool"
            data={toolMarkers}
            fill="#fb923c"
            name="Tool call"
            shape={(props: { cx?: number; cy?: number }) => (
              <circle cx={props.cx} cy={props.cy} r={5} fill="#fb923c" stroke="#fff" strokeWidth={1.5} />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey: string; value?: number; payload: ChartDatum | ToolMarker }>;
  hiddenSeries?: Partial<Record<TokenSeriesKey, boolean>>;
  fallbackPoint?: ChartDatum | null;
  fallbackToolCall?: ToolMarker | null;
}

const TokenTooltip = ({ active, payload, hiddenSeries, fallbackPoint, fallbackToolCall }: TooltipProps) => {
  const entries = payload ?? [];
  const timelinePayload = entries.find((entry) => isChartDatum(entry.payload))?.payload as ChartDatum | undefined;
  const toolPayload = entries.find((entry) => isToolMarker(entry.payload))?.payload as ToolMarker | undefined;
  const point = timelinePayload ?? fallbackPoint;
  const toolCall = toolPayload ?? fallbackToolCall ?? null;
  if (!active && !point && !toolCall) return null;
  if (!point && !toolCall) return null;
  const rows = point
    ? ([
        { key: "cached" as TokenSeriesKey, label: "System (cached)", value: point.cached },
        { key: "user" as TokenSeriesKey, label: "User", value: point.user },
        { key: "output" as TokenSeriesKey, label: "Output", value: point.output },
        { key: "reasoning" as TokenSeriesKey, label: "Reasoning", value: point.reasoning },
      ] as Array<{ key: TokenSeriesKey; label: string; value: number }>)
    : [];
  const visibleRows = rows.filter((row) => !hiddenSeries?.[row.key]);
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white shadow-xl backdrop-blur">
      {point && (
        <>
          <p className="text-xs uppercase tracking-wide text-slate-400">{formatTime(point.time ?? 0)}</p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between gap-8">
              <span className="text-slate-300">Total</span>
              <span className="font-semibold text-white">{point.total.toLocaleString()}</span>
            </div>
            {visibleRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-8">
                <span className="text-slate-300">{row.label}</span>
                <span className="font-semibold text-white">{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
          {typeof point.contextWindow === "number" && (
            <p className="mt-2 text-xs text-slate-400">Context window: {point.contextWindow.toLocaleString()}</p>
          )}
        </>
      )}
      {toolCall && (
        <div className={clsx(point && "mt-3", "border-t border-white/10 pt-3 text-left text-xs text-slate-300")}>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Tool call</p>
          <div className="mt-1 flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-white">{toolCall.name}</span>
            {toolCall.displayTime && <span className="text-xs text-slate-400">{formatTime(toolCall.displayTime)}</span>}
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Status: {toolCall.status}</p>
          {typeof toolCall.contextDelta === "number" && (
            <p className="mt-1 text-xs text-slate-200">
              Context {toolCall.contextDelta >= 0 ? "+" : ""}
              {toolCall.contextDelta.toLocaleString()} tokens
            </p>
          )}
          {toolCall.infoSnippet && (
            <div className="mt-2 max-h-28 overflow-y-auto rounded-xl bg-black/40 px-3 py-2 text-[11px] text-slate-100">
              {toolCall.infoSnippet}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const isChartDatum = (value: unknown): value is ChartDatum => {
  return Boolean(value && typeof value === "object" && "total" in value);
};

const isToolMarker = (value: unknown): value is ToolMarker => {
  return Boolean(value && typeof value === "object" && (value as ToolMarker).markerType === "tool");
};

const toMs = (preferred: number | null | undefined, call: ToolCall) => {
  if (typeof preferred === "number" && !Number.isNaN(preferred)) return preferred;
  const candidates = [call.startedAt, call.completedAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const clampToDomain = (value: number | null, start: number | null, end: number | null) => {
  if (value === null) return start ?? end ?? null;
  if (start === null || end === null) return value;
  if (start === end) return start;
  return Math.min(Math.max(value, start), end);
};

const pickSnippet = (call: ToolCall) => {
  const source = typeof call.output === "string" && call.output.trim().length
    ? call.output
    : typeof call.input === "string"
      ? call.input
      : undefined;
  if (!source) return null;
  return truncate(source, 200);
};

const truncate = (value: string, max = 200) => (value.length > max ? `${value.slice(0, max)}…` : value);
