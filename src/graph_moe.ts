// src/graph_moe.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { AppState, AppStateType } from "./state.ts";
import { routerNode } from "./nodes/router.ts";
import { coreAgentNode } from "./nodes/coreAgent.ts";
import { todoAgentNode } from "./nodes/todoAgent.ts";
import { webAgentNode } from "./nodes/webAgent.ts";
import { notesAgentNode } from "./nodes/notesAgent.ts";
import { financeAgentNode } from "./nodes/financeAgent.ts";
import { todoToolNode } from "./tools/tasks.ts";
import { webToolNode } from "./tools/web.ts";

function routeFromRouter(state: AppStateType) {
  const agent = state.selected_agent;
  if (agent === "core") return "core_agent";
  if (agent === "todo") return "todo_agent";
  if (agent === "web") return "web_agent";
  if (agent === "notes") return "notes_agent";
  if (agent === "finance") return "finance_agent";
  return END;
}

function todoNextStep(state: AppStateType) {
  const messages = state.messages ?? [];
  const last = messages[messages.length - 1] as any;
  if (last?.tool_calls && last.tool_calls.length > 0) {
    return "todo_tools";
  }
  return "router";
}

function webNextStep(state: AppStateType) {
  const messages = state.messages ?? [];
  const last = messages[messages.length - 1] as any;
  if (last?.tool_calls && last.tool_calls.length > 0) {
    return "web_tools";
  }
  return "router";
}

export const moeGraph = new StateGraph(AppState)
  .addNode("router", routerNode)
  .addNode("core_agent", coreAgentNode)
  .addNode("todo_agent", todoAgentNode)
  .addNode("todo_tools", todoToolNode)
  .addNode("web_agent", webAgentNode)
  .addNode("web_tools", webToolNode)
  .addNode("notes_agent", notesAgentNode)
  .addNode("finance_agent", financeAgentNode)
  .addEdge(START, "router")
  .addConditionalEdges("router", routeFromRouter, [
    "core_agent",
    "todo_agent",
    "web_agent",
    "notes_agent",
    "finance_agent",
    END,
  ])
  .addConditionalEdges("todo_agent", todoNextStep, [
    "todo_tools",
    "router",
  ])
  .addConditionalEdges("web_agent", webNextStep, [
    "web_tools",
    "router",
  ])
  .addEdge("todo_tools", "todo_agent")
  .addEdge("web_tools", "web_agent")
  .addEdge("core_agent", END)
  .addEdge("notes_agent", "router")
  .addEdge("finance_agent", "router")
  .compile({
    name: "bun-gemini-moe-agent",
  });
