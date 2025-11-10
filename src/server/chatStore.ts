// src/server/chatStore.ts
// @ts-ignore: Supabase client types are resolved at runtime.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/supabase.ts";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessageInput {
  channelId: string;
  senderId: string;
  content: string;
  role: ChatRole;
  expiresAt?: string;
  sources?: Json | null;
}

export interface StoredMessage {
  id: string;
}

export async function insertChatMessage(
  client: SupabaseClient<Database>,
  input: ChatMessageInput
): Promise<StoredMessage | null> {
  const sources: Json = (() => {
    if (input.sources && typeof input.sources === "object" && !Array.isArray(input.sources)) {
      return { ...(input.sources as Record<string, Json | undefined>), role: input.role };
    }
    return { role: input.role };
  })();

  const payload: Database["public"]["Tables"]["chat_messages"]["Insert"] = {
    channel_id: input.channelId,
    sender_id: input.senderId,
    content: input.content,
    expires_at: input.expiresAt,
    sources,
  };

  const { data, error } = await client
    .from("chat_messages")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("Failed to insert chat message", error);
    return null;
  }

  return data;
}
