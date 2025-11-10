// src/server/memory.ts
// Utilities for retrieving conversation context and long-term memory records.
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
// @ts-ignore: Supabase client types are resolved at runtime.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/supabase.ts";

interface MemoryOptions {
  userId: string;
  channelId: string;
  recentLimit?: number;
  summaryLimit?: number;
  factLimit?: number;
}

interface ParsedHistoryRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface MemoryResult {
  messages: BaseMessage[];
  history: ParsedHistoryRow[];
  summaries: string[];
  facts: string[];
}

const DEFAULT_RECENT_LIMIT = 12;
const DEFAULT_SUMMARY_LIMIT = 3;
const DEFAULT_FACT_LIMIT = 5;

type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];
type SummaryRow = Database["public"]["Tables"]["memory_summaries"]["Row"];
type FactRow = Database["public"]["Tables"]["memory_long_term"]["Row"];

type SourcesObject = Record<string, Json | undefined> & { role?: string };

function decodeRole(row: ChatMessageRow, userId: string): "user" | "assistant" {
  const sourceRole = ((): string | null => {
    if (!row.sources || typeof row.sources !== "object" || Array.isArray(row.sources)) {
      return null;
    }
    return (row.sources as SourcesObject).role?.toString?.() ?? null;
  })();

  if (sourceRole === "user" || sourceRole === "assistant") {
    return sourceRole;
  }

  return row.sender_id === userId ? "user" : "assistant";
}

function toBaseMessage(row: ParsedHistoryRow): BaseMessage {
  if (row.role === "assistant") {
    return new AIMessage(row.content);
  }
  return new HumanMessage(row.content);
}

function summarizeList(prefix: string, values: string[]): string {
  const trimmed = values.map((value) => value.trim()).filter(Boolean);
  if (!trimmed.length) return "";
  if (trimmed.length === 1) {
    return `${prefix} ${trimmed[0]}`;
  }
  const bullets = trimmed.map((value) => `- ${value}`).join("\n");
  return `${prefix}\n${bullets}`;
}

export async function loadMemoryContext(
  client: SupabaseClient<Database>,
  options: MemoryOptions
): Promise<MemoryResult> {
  const recentLimit = options.recentLimit ?? DEFAULT_RECENT_LIMIT;
  const summaryLimit = options.summaryLimit ?? DEFAULT_SUMMARY_LIMIT;
  const factLimit = options.factLimit ?? DEFAULT_FACT_LIMIT;

  const messages: BaseMessage[] = [];
  const systemMessages: BaseMessage[] = [];

  const { data: recentData, error: recentError } = await client
    .from("chat_messages")
    .select("id, sender_id, content, created_at, sources")
    .eq("channel_id", options.channelId)
    .order("created_at", { ascending: false })
    .limit(recentLimit);

  if (recentError) {
    console.error("loadMemoryContext: failed to fetch recent messages", recentError);
  }

  const historyRows: ParsedHistoryRow[] = ((recentData ?? []) as ChatMessageRow[])
    .map((row: ChatMessageRow) => ({
      id: row.id,
      role: decodeRole(row, options.userId),
      content: row.content,
      createdAt: row.created_at,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  historyRows.forEach((row) => {
    messages.push(toBaseMessage(row));
  });

  const { data: summaryData, error: summaryError } = await client
    .from("memory_summaries")
    .select("summary")
    .eq("channel_id", options.channelId)
    .order("coverage_end", { ascending: false })
    .limit(summaryLimit);

  if (summaryError) {
    console.error("loadMemoryContext: failed to fetch summaries", summaryError);
  }

  const summaries = ((summaryData ?? []) as SummaryRow[])
    .map((row: SummaryRow) => row.summary?.trim())
    .filter((summary): summary is string => Boolean(summary));

  if (summaries.length) {
    const summaryMessage = summarizeList("Conversation summary:", summaries);
    if (summaryMessage) {
      systemMessages.push(new SystemMessage(summaryMessage));
    }
  }

  const { data: factData, error: factError } = await client
    .from("memory_long_term")
    .select("statement")
    .eq("user_id", options.userId)
    .is("archived_at", null)
    .order("last_updated_at", { ascending: false })
    .limit(factLimit);

  if (factError) {
    console.error("loadMemoryContext: failed to fetch long-term facts", factError);
  }

  const facts = ((factData ?? []) as FactRow[])
    .map((row: FactRow) => row.statement?.trim())
    .filter((statement): statement is string => Boolean(statement));

  if (facts.length) {
    const factMessage = summarizeList("Known user facts:", facts);
    if (factMessage) {
      systemMessages.push(new SystemMessage(factMessage));
    }
  }

  for (let i = systemMessages.length - 1; i >= 0; i -= 1) {
    messages.unshift(systemMessages[i]);
  }

  return {
    messages,
    history: historyRows,
    summaries,
    facts,
  };
}
