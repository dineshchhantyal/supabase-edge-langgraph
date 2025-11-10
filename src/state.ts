// src/state.ts
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

const AGENT_VALUES = ["core", "todo", "web", "notes", "finance"] as const;
export type AgentValue = (typeof AGENT_VALUES)[number];
const ALLOWED_AGENTS = new Set<AgentValue>(AGENT_VALUES);

export const AppState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  goal: Annotation<string | null>({
    reducer: (previous, update) =>
      typeof update === "undefined" ? previous : update,
    default: () => null,
  }),
  selected_agent: Annotation<"core" | "todo" | "web" | "notes" | "finance" | null>({
    reducer: (previous, update) =>
      typeof update === "undefined" ? previous : update,
    default: () => null,
  }),
  pending_agents: Annotation<Array<AgentValue>>({
    reducer: (_previous, update) =>
      Array.isArray(update)
        ? update.filter((agent): agent is AgentValue =>
            typeof agent === "string" && ALLOWED_AGENTS.has(agent as AgentValue)
          )
        : [],
    default: () => [],
  }),
  last_routed_message_id: Annotation<string | null>({
    reducer: (previous, update) =>
      typeof update === "undefined" ? previous : update ?? null,
    default: () => null,
  }),
});

export type AppStateType = typeof AppState.State;
