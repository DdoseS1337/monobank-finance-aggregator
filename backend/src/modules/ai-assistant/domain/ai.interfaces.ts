import type { UIMessage } from 'ai';

export type AiModelId =
  | 'gpt-5'
  | 'gpt-4.1-mini'
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6';

export interface AiThread {
  id: string;
  userId: string;
  title: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface AiMessageRecord {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  parts: UIMessage['parts'];
  createdAt: string;
}
