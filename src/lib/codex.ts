import path from "path";
import os from "os";
import { promises as fs } from "fs";
import fg from "fast-glob";

const CODEX_ROOT = process.env.CODEX_ROOT ?? path.join(os.homedir(), ".codex");
const SESSIONS_ROOT = path.join(CODEX_ROOT, "sessions");

const summaryCache = new Map<string, { mtimeMs: number; summary: SessionSummary }>();

type TokenUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
};

type TokenInfo = {
  total_token_usage: TokenUsage;
  last_token_usage: TokenUsage;
  model_context_window?: number;
};

type JsonRecord = Record<string, unknown>;

interface CodexEvent {
  timestamp?: string;
  type?: string;
  payload?: JsonRecord | null;
}

interface SessionMetaPayload extends JsonRecord {
  id?: string;
  timestamp?: string;
  cwd?: string;
}

interface ResponsePayload extends JsonRecord {
  type?: string;
  role?: string;
  content?: unknown;
  call_id?: string;
  name?: string;
  status?: string;
  input?: string;
  arguments?: string;
  output?: unknown;
  summary?: unknown;
}

interface TokenPayload extends JsonRecord {
  type?: string;
  info?: TokenInfo | null;
}

const toRecord = (value: unknown): JsonRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;

export interface SessionSummary {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  relativePath: string;
  startedAt: string;
  lastActivityAt: string;
  preview: string;
  totalTokens: number;
  cachedTokens: number;
  userTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  contextWindow?: number;
  toolCallCount: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  latestActivityAt?: string;
  totalTokens: number;
}

export interface ChatMessage {
  id: string;
  timestamp: string;
  role: "user" | "assistant" | "system" | "status";
  kind: "text" | "reasoning" | "status";
  text: string;
}

export interface TokenTimelinePoint {
  timestamp: string;
  timestampMs: number;
  totalTokens: number;
  inputTokens: number;
  cachedTokens: number;
  userTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  contextWindow?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  toolKind: "function" | "custom";
  status: string;
  input?: string;
  output?: string;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface SessionDetail {
  summary: SessionSummary;
  messages: ChatMessage[];
  tokenTimeline: TokenTimelinePoint[];
  toolCalls: ToolCall[];
}

const emptySummary: SessionSummary = {
  id: "",
  projectId: "",
  projectName: "",
  projectPath: "",
  relativePath: "",
  startedAt: new Date(0).toISOString(),
  lastActivityAt: new Date(0).toISOString(),
  preview: "",
  totalTokens: 0,
  cachedTokens: 0,
  userTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  contextWindow: undefined,
  toolCallCount: 0,
};

const lineFilter = (line: string) =>
  line && !line.startsWith("Total output lines") ? line : "";

const extractSessionId = (filePath: string): string | null => {
  const base = path.basename(filePath, ".jsonl");
  const match = base.match(/rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)/);
  return match?.[1] ?? null;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const extractText = (content: unknown): string => {
  if (!Array.isArray(content)) return "";
  return content
    .map((chunk) => {
      if (typeof chunk !== "object" || !chunk) return "";
      if ("text" in chunk && typeof chunk.text === "string") {
        return chunk.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
};

const safeParse = <T>(maybe: string): T | undefined => {
  try {
    return JSON.parse(maybe) as T;
  } catch {
    return undefined;
  }
};

async function listSessionFiles(): Promise<string[]> {
  try {
    const files = await fg("**/*.jsonl", {
      cwd: SESSIONS_ROOT,
      absolute: true,
      suppressErrors: true,
    });
    files.sort();
    return files;
  } catch {
    return [];
  }
}

async function readJsonl(filePath: string): Promise<CodexEvent[]> {
  const raw = await fs.readFile(filePath, "utf-8");
  const events: CodexEvent[] = [];
  for (const line of raw.split("\n")) {
    const cleaned = lineFilter(line.trim());
    if (!cleaned) continue;
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        events.push(parsed as CodexEvent);
      }
    } catch {
      // ignore malformed line
    }
  }
  return events;
}

function composePreview(text: string): string {
  if (!text) return "(no prompt logged)";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

async function parseSessionSummary(filePath: string): Promise<SessionSummary | null> {
  const sessionId = extractSessionId(filePath);
  if (!sessionId) return null;

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) return null;

  const cached = summaryCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.summary;
  }

  const events = await readJsonl(filePath);
  let meta: SessionMetaPayload | null = null;
  let preview = "";
  let startedAt = "";
  let lastActivityAt = "";
  let tokens: TokenUsage | null = null;
  let contextWindow: number | undefined;
  const toolCalls = new Set<string>();

  for (const event of events) {
    const eventTimestamp = typeof event.timestamp === "string" ? event.timestamp : undefined;
    if (eventTimestamp) {
      lastActivityAt = eventTimestamp;
      if (!startedAt) {
        startedAt = eventTimestamp;
      }
    }

    if (event.type === "session_meta") {
      const payload = toRecord(event.payload) as SessionMetaPayload | undefined;
      if (payload) {
        meta = payload;
        startedAt = payload.timestamp ?? startedAt;
      }
      continue;
    }

    if (event.type === "response_item") {
      const payload = toRecord(event.payload) as ResponsePayload | undefined;
      if (!payload) continue;
      if (payload.type === "message" && payload.role === "user" && !preview) {
        preview = composePreview(extractText(payload.content));
      }
      if (
        (payload.type === "function_call" || payload.type === "custom_tool_call") &&
        typeof payload.call_id === "string"
      ) {
        toolCalls.add(payload.call_id);
      }
    }

    if (event.type === "event_msg") {
      const payload = toRecord(event.payload) as TokenPayload | undefined;
      if (payload?.type === "token_count" && payload.info) {
        tokens = payload.info.total_token_usage;
        contextWindow = payload.info.model_context_window;
      }
    }
  }

  if (!meta) return null;

  const summary: SessionSummary = {
    id: sessionId,
    projectId: slugify(meta.cwd ?? "unknown"),
    projectName: path.basename(meta.cwd ?? "unknown") || meta.cwd || "unknown",
    projectPath: meta.cwd ?? "unknown",
    relativePath: path.relative(CODEX_ROOT, filePath),
    startedAt: startedAt || meta.timestamp || new Date(0).toISOString(),
    lastActivityAt: lastActivityAt || startedAt || meta.timestamp || new Date(0).toISOString(),
    preview: preview || "(no prompt logged)",
    totalTokens: tokens?.total_tokens ?? 0,
    cachedTokens: tokens?.cached_input_tokens ?? 0,
    userTokens: tokens ? Math.max(0, tokens.input_tokens - tokens.cached_input_tokens) : 0,
    outputTokens: tokens?.output_tokens ?? 0,
    reasoningTokens: tokens?.reasoning_output_tokens ?? 0,
    contextWindow,
    toolCallCount: toolCalls.size,
  };

  summaryCache.set(filePath, { mtimeMs: stat.mtimeMs, summary });
  return summary;
}

export async function getSessionSummaries(): Promise<SessionSummary[]> {
  const files = await listSessionFiles();
  const summaries: SessionSummary[] = [];
  for (const file of files) {
    const summary = await parseSessionSummary(file);
    if (summary) summaries.push(summary);
  }
  return summaries.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const sessions = await getSessionSummaries();
  const map = new Map<string, ProjectSummary>();
  for (const session of sessions) {
    const current = map.get(session.projectId) ?? {
      id: session.projectId,
      name: session.projectName,
      path: session.projectPath,
      sessionCount: 0,
      latestActivityAt: undefined,
      totalTokens: 0,
    };
    current.sessionCount += 1;
    current.totalTokens += session.totalTokens;
    if (!current.latestActivityAt || current.latestActivityAt < session.lastActivityAt) {
      current.latestActivityAt = session.lastActivityAt;
    }
    map.set(session.projectId, current);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (!a.latestActivityAt || !b.latestActivityAt) return 0;
    return a.latestActivityAt < b.latestActivityAt ? 1 : -1;
  });
}

function buildToolCalls(events: CodexEvent[]): { toolCalls: ToolCall[]; toolCallCount: number } {
  const calls = new Map<string, ToolCall>();
  for (const event of events) {
    if (event.type !== "response_item") continue;
    const payload = toRecord(event.payload) as ResponsePayload | undefined;
    if (!payload) continue;
    const timestamp = typeof event.timestamp === "string" ? event.timestamp : undefined;
    if (payload.type === "function_call" && typeof payload.call_id === "string") {
      const existing = calls.get(payload.call_id) ?? {
        id: payload.call_id,
        name: payload.name ?? "function_call",
        toolKind: "function" as const,
        status: payload.status ?? "in_progress",
      };
      existing.name = payload.name ?? existing.name;
      if (typeof payload.arguments === "string") {
        existing.input = payload.arguments;
      }
      existing.startedAt = existing.startedAt ?? timestamp;
      existing.status = payload.status ?? existing.status;
      calls.set(payload.call_id, existing);
    }
    if (payload.type === "function_call_output" && typeof payload.call_id === "string") {
      const existing = calls.get(payload.call_id);
      if (existing) {
        if (typeof payload.output === "string") {
          existing.output = payload.output;
        }
        existing.completedAt = timestamp ?? existing.completedAt;
        existing.status = "completed";
      }
    }
    if (payload.type === "custom_tool_call" && typeof payload.call_id === "string") {
      const existing = calls.get(payload.call_id) ?? {
        id: payload.call_id,
        name: payload.name ?? "custom_tool",
        toolKind: "custom" as const,
        status: payload.status ?? "in_progress",
      };
      if (typeof payload.input === "string") {
        existing.input = payload.input;
      }
      existing.startedAt = existing.startedAt ?? timestamp;
      existing.status = payload.status ?? existing.status;
      calls.set(payload.call_id, existing);
    }
    if (payload.type === "custom_tool_call_output" && typeof payload.call_id === "string") {
      const existing = calls.get(payload.call_id);
      if (existing) {
        const parsed =
          typeof payload.output === "string"
            ? safeParse<{ output?: string; metadata?: Record<string, unknown> }>(payload.output)
            : (payload.output as { output?: string; metadata?: Record<string, unknown> } | undefined);
        if (parsed?.output) {
          existing.output = parsed.output;
        } else if (typeof payload.output === "string") {
          existing.output = payload.output;
        }
        existing.metadata = parsed?.metadata ?? existing.metadata;
        existing.completedAt = timestamp ?? existing.completedAt;
        existing.status = "completed";
      }
    }
  }

  const finalized = Array.from(calls.values()).map((call) => {
    if (call.startedAt && call.completedAt) {
      call.durationMs = new Date(call.completedAt).getTime() - new Date(call.startedAt).getTime();
    }
    return call;
  });

  return { toolCalls: finalized.sort((a, b) => (a.startedAt && b.startedAt ? (a.startedAt > b.startedAt ? 1 : -1) : 0)), toolCallCount: finalized.length };
}

function buildMessages(events: CodexEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const event of events) {
    if (event.type === "response_item") {
      const payload = toRecord(event.payload) as ResponsePayload | undefined;
      if (!payload) continue;
      if (payload.type === "message") {
        const role = (payload.role ?? "assistant") as ChatMessage["role"];
        messages.push({
          id: `${event.timestamp}-message-${messages.length}`,
          timestamp: typeof event.timestamp === "string" ? event.timestamp : new Date(0).toISOString(),
          role,
          kind: "text",
          text: extractText(payload.content),
        });
        continue;
      }
      if (payload.type === "reasoning") {
        const summaryText = Array.isArray(payload.summary)
          ? payload.summary
              .map((item: unknown) =>
                typeof (item as { text?: string } | undefined)?.text === "string"
                  ? ((item as { text: string }).text as string)
                  : ""
              )
              .filter(Boolean)
              .join("\n")
          : "Reasoning log hidden";
        messages.push({
          id: `${event.timestamp}-reasoning-${messages.length}`,
          timestamp: typeof event.timestamp === "string" ? event.timestamp : new Date(0).toISOString(),
          role: "assistant",
          kind: "reasoning",
          text: summaryText || "Reasoning log hidden",
        });
        continue;
      }
    }

    if (event.type === "event_msg") {
      const payload = toRecord(event.payload);
      if (payload?.type === "agent_reasoning") {
        messages.push({
          id: `${event.timestamp}-agent-${messages.length}`,
          timestamp: typeof event.timestamp === "string" ? event.timestamp : new Date(0).toISOString(),
          role: "assistant",
          kind: "status",
          text: typeof payload.text === "string" ? payload.text : "",
        });
      }
    }
  }
  return messages.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
}

function buildTokenTimeline(events: CodexEvent[]): TokenTimelinePoint[] {
  const points: TokenTimelinePoint[] = [];
  for (const event of events) {
    if (event.type !== "event_msg") continue;
    const payload = toRecord(event.payload) as TokenPayload | undefined;
    if (payload?.type === "token_count" && payload.info && payload.info.total_token_usage) {
      const total = payload.info.total_token_usage;
      const timestamp = typeof event.timestamp === "string" ? event.timestamp : new Date(0).toISOString();
      points.push({
        timestamp,
        timestampMs: new Date(timestamp).getTime(),
        totalTokens: total.total_tokens,
        inputTokens: total.input_tokens,
        cachedTokens: total.cached_input_tokens,
        userTokens: Math.max(0, total.input_tokens - total.cached_input_tokens),
        outputTokens: total.output_tokens,
        reasoningTokens: total.reasoning_output_tokens,
        contextWindow: payload.info.model_context_window,
      });
    }
  }
  return points.sort((a, b) => a.timestampMs - b.timestampMs);
}

async function findSessionFile(sessionId: string): Promise<string | undefined> {
  const files = await listSessionFiles();
  return files.find((file) => extractSessionId(file) === sessionId);
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const filePath = await findSessionFile(sessionId);
  if (!filePath) return null;
  const events = await readJsonl(filePath);
  const summary = (await parseSessionSummary(filePath)) ?? emptySummary;
  const tokenTimeline = buildTokenTimeline(events);
  const { toolCalls } = buildToolCalls(events);
  const messages = buildMessages(events);

  return {
    summary,
    messages,
    tokenTimeline,
    toolCalls,
  };
}

export async function getSessionsForProject(projectId: string): Promise<SessionSummary[]> {
  const sessions = await getSessionSummaries();
  return sessions.filter((session) => session.projectId === projectId);
}
