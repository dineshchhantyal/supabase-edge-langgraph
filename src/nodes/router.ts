// src/nodes/router.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AppStateType, AgentValue } from "../state.ts";
import { normalizeRecentMessages, contentToText } from "../utils/messages.ts";

const routerModel = new ChatGoogleGenerativeAI({
  model: "gemini-flash-latest",
  temperature: 0,
});

const ROUTER_SYSTEM = `
You are Jarvis OS's **Mission Router**.

Analyze the latest human request and produce the optimal ordered set of agents to respond.

Return **only** a JSON array of agent ids, for example: ["todo", "web"].

 Agent roster:
 - "core": Nova — answer directly with a concise conversational reply.
 - "todo": Task Orchestrator — manage and clarify task lists.
 - "web": Sentinel Analyst — fetch current market/news intel with citations.
- "notes": Knowledge Synthesizer — summarize or document conversations.
- "finance": Market Navigator — interpret market moves and financial concepts.

Routing guidance:
- Include every capability the user clearly requests; maintain order of operations.
- Use "web" whenever the user needs current data, verification, or live info.
- Pair "finance" with "web" if analysis depends on fresh market data.
- Use "todo" for planning, follow-ups, reminders, or task changes.
- Use "notes" for recaps, summaries, or documentation requests.
- Default fallback: ["core"].
- Avoid duplicates unless the user insists on revisiting the same agent.
`.trim();

const ALL_AGENTS: AgentValue[] = ["core", "todo", "web", "notes", "finance"];

function sanitizeAgentList(value: unknown): AgentValue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: AgentValue[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const match = ALL_AGENTS.find((agent) => agent === item);
    if (match) {
      result.push(match);
    }
  }
  return result;
}

function parsePlan(text: string): AgentValue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  if (Array.isArray(parsed)) {
    const ordered: AgentValue[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") {
        continue;
      }
      const lower = item.trim().toLowerCase();
      const match = ALL_AGENTS.find((agent) => lower === agent);
      if (match && !ordered.includes(match)) {
        ordered.push(match);
      }
    }
    if (ordered.length > 0) {
      return ordered;
    }
  }

  const lowerText = text.toLowerCase();
  const inferred: AgentValue[] = [];
  for (const agent of ALL_AGENTS) {
    if (lowerText.includes(agent) && !inferred.includes(agent)) {
      inferred.push(agent);
    }
  }
  if (inferred.length > 0) {
    return inferred;
  }
  return ["core"];
}

function getLastHumanMessage(
  messages: ReturnType<typeof normalizeRecentMessages>
): { index: number; message: any } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    const type =
      typeof candidate?.getType === "function"
        ? candidate.getType()
        : (candidate as any)?.type ?? (candidate as any)?.role;
    if (type === "human" || type === "user") {
      return { index: i, message: candidate };
    }
  }
  return null;
}

export async function routerNode(
  state: AppStateType
): Promise<Partial<AppStateType>> {
  const messages = normalizeRecentMessages(state.messages, 6);
  const queue = sanitizeAgentList(state.pending_agents);

  if (queue.length > 0) {
    const [next, ...rest] = queue;
    return {
      selected_agent: next,
      pending_agents: rest,
    };
  }

  const lastHumanEntry = getLastHumanMessage(messages);

  if (!lastHumanEntry) {
    return {
      selected_agent: null,
    };
  }

  const { index: lastHumanIndex, message: lastHuman } = lastHumanEntry;
  const lastHumanText = contentToText((lastHuman as any)?.content).trim();
  const messageKey =
    (lastHuman as any)?.id ?? `${lastHumanIndex}:${lastHumanText}`;

  if (state.last_routed_message_id === messageKey) {
    return {
      selected_agent: null,
    };
  }

  const reply = await routerModel.invoke([
    new SystemMessage(ROUTER_SYSTEM),
    new HumanMessage(lastHumanText),
  ]);

  const plan = parsePlan(contentToText(reply.content));
  const effectivePlan: AgentValue[] = plan.length > 0 ? plan : ["core"];
  const [next, ...rest] = effectivePlan;

  return {
    selected_agent: next,
    pending_agents: rest,
    last_routed_message_id: messageKey,
  };
}
