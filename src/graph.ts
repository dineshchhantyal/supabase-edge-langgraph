// src/graph.ts
import { z } from "zod";
import {
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AppState, AppStateType } from "./state.ts";
import { normalizeMessages } from "./utils/messages.ts";

// Tool
const add = tool(
  ({ a, b }) => {
    const sum = a + b;
    return `Result: ${sum}`;
  },
  {
    name: "add",
    description: "Add two integers",
    schema: z.object({
      a: z.number().int().describe("first number"),
      b: z.number().int().describe("second number"),
    }),
  }
);

const tools = [add];

// Gemini model with tools
const llmWithTools = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",   // or gemini-2.5-pro
  temperature: 0,
}).bindTools(tools);

// Tool node
const toolNode = new ToolNode(tools);

type AgentState = AppStateType;

// Assistant node
async function assistantNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const history = normalizeMessages(state.messages);
  const response = await llmWithTools.invoke(history);
  return { messages: [response] };
}

// Routing
function shouldContinue(state: AgentState) {
  const messages = state.messages ?? [];
  const last = messages[messages.length - 1] as any;
  if (last?.tool_calls && last.tool_calls.length > 0) {
    return "tools";
  }
  return END;
}

// This is the important export for the CLI and Studio
export const graph = new StateGraph(AppState)
  .addNode("assistant", assistantNode)
  .addNode("tools", toolNode)
  .addEdge(START, "assistant")
  .addConditionalEdges("assistant", shouldContinue, ["tools", END])
  .addEdge("tools", "assistant")
  .compile({
    name: "bun-gemini-agent",
  });
