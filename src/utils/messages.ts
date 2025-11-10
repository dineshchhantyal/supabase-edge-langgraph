import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";

export function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String((part as any).text ?? "");
        }
        return "";
      })
      .join(" ")
      .trim();
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as any).text ?? "");
  }
  if (content == null) {
    return "";
  }
  return String(content);
}

export function getMessageText(message?: BaseMessage | null): string {
  if (!message) {
    return "";
  }
  const raw = (message as any).content;
  return contentToText(raw);
}

function hasNonEmptyContent(message: BaseMessage): boolean {
  const { content } = message as BaseMessage & { content: unknown };
  if (typeof content === "string") {
    return content.trim().length > 0;
  }
  if (Array.isArray(content)) {
    return content.length > 0;
  }
  return false;
}

function extractFallbackText(message: BaseMessage): string | undefined {
  const candidateSources = [
    (message as any).message,
    (message as any).text,
    (message as any).lc_kwargs?.content,
    (message as any).lc_kwargs?.message,
    (message as any).lc_kwargs?.text,
    (message as any).additional_kwargs?.content,
  ];

  for (const candidate of candidateSources) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return undefined;
}

function messageType(message: BaseMessage): string {
  if (typeof (message as any).getType === "function") {
    return (message as any).getType();
  }
  if (typeof (message as any).type === "string") {
    return (message as any).type;
  }
  if (typeof (message as any).role === "string") {
    return (message as any).role;
  }
  return "";
}

function rebuildMessage(message: BaseMessage, content: string): BaseMessage {
  const common = {
    content,
    additional_kwargs: message.additional_kwargs ?? {},
    response_metadata: message.response_metadata ?? {},
    name: (message as any).name,
    id: message.id,
  } as const;

  const type = messageType(message);
  if (type === "human" || type === "user") {
    return new HumanMessage(common);
  }
  if (type === "ai" || type === "assistant") {
    return new AIMessage({
      ...common,
      tool_calls: (message as any).tool_calls,
      invalid_tool_calls: (message as any).invalid_tool_calls,
      usage_metadata: (message as any).usage_metadata,
    });
  }
  if (type === "system" || type === "developer") {
    return new SystemMessage(common);
  }
  return new HumanMessage(common);
}

export function normalizeMessages(
  messages?: BaseMessage[] | null
): BaseMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  return messages.map((message) => {
    if (!message) {
      return message;
    }

    if (hasNonEmptyContent(message)) {
      return message;
    }

    const fallback = extractFallbackText(message);
    if (!fallback) {
      return message;
    }

    return rebuildMessage(message, fallback);
  });
}

export function normalizeRecentMessages(
  messages?: BaseMessage[] | null,
  limit = 6
): BaseMessage[] {
  const normalized = normalizeMessages(messages);
  if (limit == null || limit <= 0) {
    return normalized;
  }
  return normalized.slice(-limit);
}
