// src/nodes/coreAgent.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage } from "@langchain/core/messages";
import { AppStateType } from "../state.ts";
import { normalizeRecentMessages, getMessageText } from "../utils/messages.ts";
import { getSystemPrompt } from "../prompt.ts";

const baseModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  streaming: true,
});

const DEFAULT_PROMPT = `You are a friendly, capable AI buddy. Be direct, helpful, and conversational. Default to short answers; expand only when useful.`;

const SYSTEM_PROMPT =
  typeof getSystemPrompt === "function"
    ? getSystemPrompt() ?? DEFAULT_PROMPT
    : DEFAULT_PROMPT;

export async function coreAgentNode(
  state: AppStateType
): Promise<Partial<AppStateType>> {
  const history = normalizeRecentMessages(state.messages, 6);
  const promptMessages = SYSTEM_PROMPT
    ? [new SystemMessage(SYSTEM_PROMPT), ...history]
    : history;

  const reply = await baseModel.invoke(promptMessages);
  const text = getMessageText(reply).trim();
  if (!text && !((reply as any)?.tool_calls?.length)) {
    return {};
  }

  return {
    messages: [reply],
  };
}
