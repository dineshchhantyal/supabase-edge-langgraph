// src/types/supabase.ts
// Minimal Supabase database type definitions used by the runtime helpers.
// Extend this as more tables or views are queried.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      chat_channels: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          topic: string | null;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          topic?: string | null;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          topic?: string | null;
          archived_at?: string | null;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string;
          content: string;
          created_at: string;
          expires_at: string;
          sources: Json | null;
        };
        Insert: {
          id?: string;
          channel_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
          expires_at?: string;
          sources?: Json | null;
        };
        Update: {
          id?: string;
          channel_id?: string;
          sender_id?: string;
          content?: string;
          created_at?: string;
          expires_at?: string;
          sources?: Json | null;
        };
      };
      memory_summaries: {
        Row: {
          id: string;
          channel_id: string;
          summary_type: string;
          summary: string;
          coverage_start: string;
          coverage_end: string;
          source_message_ids: string[];
          token_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          summary_type?: string;
          summary: string;
          coverage_start: string;
          coverage_end: string;
          source_message_ids?: string[];
          token_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string;
          summary_type?: string;
          summary?: string;
          coverage_start?: string;
          coverage_end?: string;
          source_message_ids?: string[];
          token_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      memory_long_term: {
        Row: {
          id: string;
          user_id: string;
          channel_id: string | null;
          fact_type: string;
          statement: string;
          confidence: number;
          freshness_horizon: string | null;
          source_message_ids: string[];
          metadata: Json;
          first_seen_at: string;
          last_updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_id?: string | null;
          fact_type: string;
          statement: string;
          confidence?: number;
          freshness_horizon?: string | null;
          source_message_ids?: string[];
          metadata?: Json;
          first_seen_at?: string;
          last_updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel_id?: string | null;
          fact_type?: string;
          statement?: string;
          confidence?: number;
          freshness_horizon?: string | null;
          source_message_ids?: string[];
          metadata?: Json;
          first_seen_at?: string;
          last_updated_at?: string;
          archived_at?: string | null;
        };
      };
      usage_ledgers: {
        Row: {
          user_id: string;
          period: "daily" | "weekly" | "monthly" | string;
          period_start: string;
          tokens_used: number;
          seconds_active: number;
          runs: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          period: "daily" | "weekly" | "monthly" | string;
          period_start: string;
          tokens_used?: number;
          seconds_active?: number;
          runs?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          period?: "daily" | "weekly" | "monthly" | string;
          period_start?: string;
          tokens_used?: number;
          seconds_active?: number;
          runs?: number;
          updated_at?: string;
        };
      };
    };
    Views: {
      recent_chat_messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string;
          content: string;
          created_at: string;
          expires_at: string;
          sources: Json | null;
          position: number;
        };
      };
    };
  };
}
