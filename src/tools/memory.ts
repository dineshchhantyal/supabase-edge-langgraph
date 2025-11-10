// src/tools/memory.ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createServiceClient } from "../server/supabaseClient.ts";
import { loadMemoryContext } from "../server/memory.ts";

interface MemoryToolConfig {
  userId: string;
  channelId: string;
  recentLimit?: number;
  summaryLimit?: number;
  factLimit?: number;
}

const DEFAULT_RECENT_LIMIT = 8;
const DEFAULT_SUMMARY_LIMIT = 3;
const DEFAULT_FACT_LIMIT = 5;

function formatList(title: string, values: string[]): string {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  if (!cleaned.length) return `${title}: none found.`;
  if (cleaned.length === 1) {
    return `${title}: ${cleaned[0]}`;
  }
  const bullets = cleaned.map((value) => `- ${value}`).join("\n");
  return `${title}:\n${bullets}`;
}

export function createMemoryRecallTool(config: MemoryToolConfig) {
  const client = createServiceClient();

  return new DynamicStructuredTool({
    name: "memory_lookup",
    description:
      "Fetch summaries, long-term facts, or the latest conversation snippets for the current user/channel. Call this when you need reminders, preferences, or prior context before answering.",
    schema: z
      .object({
        scope: z
          .enum(["all", "summaries", "facts", "history"])
          .optional()
          .describe("Which memory layer to retrieve. Defaults to 'all'."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Override the number of history messages to return."),
      })
      .optional(),
    func: async (rawInput) => {
      const input = rawInput ?? {};
      const scope = (input.scope ?? "all") as "all" | "summaries" | "facts" | "history";

      const context = await loadMemoryContext(client, {
        userId: config.userId,
        channelId: config.channelId,
        recentLimit: input.limit ?? config.recentLimit ?? DEFAULT_RECENT_LIMIT,
        summaryLimit: config.summaryLimit ?? DEFAULT_SUMMARY_LIMIT,
        factLimit: config.factLimit ?? DEFAULT_FACT_LIMIT,
      });

      const sections: string[] = [];

      if (scope === "all" || scope === "summaries") {
        sections.push(formatList("Recent summaries", context.summaries));
      }

      if (scope === "all" || scope === "facts") {
        sections.push(formatList("Known user facts", context.facts));
      }

      if (scope === "all" || scope === "history") {
        const historyLines = context.history.map((entry) => {
          const role = entry.role === "assistant" ? "Assistant" : "User";
          return `${role} (${entry.createdAt}): ${entry.content}`;
        });
        sections.push(formatList("Recent conversation", historyLines));
      }

      return sections.filter(Boolean).join("\n\n");
    },
  });
}
