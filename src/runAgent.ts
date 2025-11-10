// src/runAgent.ts
import type { BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { moeGraph } from "./graph_moe.ts"; // note the .ts here

export interface AgentInvocationState {
  messages: BaseMessage[];
  goal?: string | null;
  userId?: string | null;
  channelId?: string | null;
}

function buildInitialState(state: AgentInvocationState) {
  const payload: Record<string, unknown> = {
    messages: state.messages,
  };
  if (state.goal) {
    payload.goal = state.goal;
  }
  if (state.userId) {
    payload.user_id = state.userId;
  }
  if (state.channelId) {
    payload.channel_id = state.channelId;
  }
  return payload;
}

export async function runAgent(state: AgentInvocationState) {
  const finalState = await moeGraph.invoke(buildInitialState(state));
  return finalState;
}

export function streamAgentEvents(
  state: AgentInvocationState,
  options?: Partial<RunnableConfig> & { version?: "v1" | "v2" }
) {
  const { version = "v2", ...rest } = options ?? {};
  return moeGraph.streamEvents(
    buildInitialState(state),
    {
      ...(rest as Partial<RunnableConfig>),
      version,
    }
  );
}
