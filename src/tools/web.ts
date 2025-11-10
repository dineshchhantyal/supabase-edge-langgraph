// src/tools/web.ts
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const tavilyKey =
  (globalThis as Record<string, any>)?.Deno?.env?.get?.("TAVILY_API_KEY") ??
  (typeof process !== "undefined" ? process.env?.TAVILY_API_KEY : undefined);

const hasTavily = Boolean(tavilyKey);

const webTools = hasTavily
  ? [
      new TavilySearchResults({
        maxResults: 5,
      }),
    ]
  : [
      tool(
        async ({ query }) =>
          `Web search unavailable: missing TAVILY_API_KEY. Please set this environment variable to enable live search.\nQuery: ${query}`,
        {
          name: "web_search_placeholder",
          description: "Fallback tool when Tavily search is not configured.",
          schema: z.object({
            query: z.string(),
          }),
        }
      ),
    ];

export { webTools };
export const webToolNode = new ToolNode(webTools);
