'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import {
  aiChatUrl,
  buildAiChatHeaders,
  createAiThread,
  deleteAiThread,
  getAiModels,
  getAiThread,
  listAiThreads,
} from '@/lib/api';
import type {
  AiModelId,
  AiModelMeta,
  AiThread,
  StoredAiMessage,
} from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageBubble } from '@/components/assistant/message-bubble';
import { ThreadSidebar } from '@/components/assistant/thread-sidebar';
import { ModelPicker } from '@/components/assistant/model-picker';
import { SuggestedPrompts } from '@/components/assistant/suggested-prompts';

export default function AssistantPage() {
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [models, setModels] = useState<AiModelMeta[]>([]);
  const [defaultModel, setDefaultModel] = useState<AiModelId>('claude-sonnet-4-6');
  const [selectedModel, setSelectedModel] = useState<AiModelId>('claude-sonnet-4-6');
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Transport must be stable — `useChat` captures it once at mount and
  // ignores subsequent changes. We use refs so `body()` always reads the
  // latest threadId / model when a request is fired, enabling mid-chat
  // model switching without resetting the conversation.
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const selectedModelRef = useRef<AiModelId>(selectedModel);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: aiChatUrl(),
        headers: async () => buildAiChatHeaders(),
        body: () => ({
          threadId: activeThreadIdRef.current,
          model: selectedModelRef.current,
        }),
      }),
    [],
  );

  // Reset the chat hook whenever the thread changes by keying off threadId
  // + loading messages as initial state.
  const chatKey = activeThreadId ?? 'none';
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: chatKey,
    messages: initialMessages,
    transport,
  });

  // Load threads + models on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, m] = await Promise.all([listAiThreads(), getAiModels()]);
        if (cancelled) return;
        setThreads(t);
        setModels(m.models);
        setDefaultModel(m.default);
        setSelectedModel(m.default);
        if (t.length > 0) setActiveThreadId(t[0].id);
      } catch (e) {
        if (!cancelled)
          setListError(e instanceof Error ? e.message : 'Помилка завантаження');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load messages for the selected thread
  useEffect(() => {
    if (!activeThreadId) {
      setInitialMessages([]);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    (async () => {
      try {
        const { thread, messages: stored } = await getAiThread(activeThreadId);
        if (cancelled) return;
        const ui: UIMessage[] = stored.map((m: StoredAiMessage) => ({
          id: m.id,
          role: m.role,
          parts: m.parts as UIMessage['parts'],
        }));
        setInitialMessages(ui);
        setMessages(ui);
        if (thread.model) setSelectedModel(thread.model as AiModelId);
      } catch (e) {
        if (!cancelled)
          setListError(e instanceof Error ? e.message : 'Помилка завантаження розмови');
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingHistory]);

  const handleNewThread = useCallback(async () => {
    const t = await createAiThread(selectedModel);
    setThreads((prev) => [t, ...prev]);
    setActiveThreadId(t.id);
  }, [selectedModel]);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      await deleteAiThread(id);
      setThreads((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        if (activeThreadId === id) {
          setActiveThreadId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
    },
    [activeThreadId],
  );

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Auto-create thread on first message
      let threadId = activeThreadId;
      if (!threadId) {
        const t = await createAiThread(selectedModel);
        threadId = t.id;
        setThreads((prev) => [t, ...prev]);
        setActiveThreadId(threadId);
        // Wait a tick so transport picks up new threadId via closure
        await new Promise((r) => setTimeout(r, 0));
      }

      setDraft('');
      await sendMessage({ text: trimmed });

      // Refresh threads list to pick up auto-derived title
      const refreshed = await listAiThreads();
      setThreads(refreshed);
    },
    [activeThreadId, selectedModel, sendMessage],
  );

  const isBusy = status === 'submitted' || status === 'streaming';

  return (
    <div className="h-[calc(100vh-6rem)] -mx-6 md:-mx-6 -my-6 flex">
      {/* Threads sidebar */}
      <aside className="w-64 border-r border-border bg-card flex-shrink-0 hidden md:flex md:flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Розмови</h2>
        </div>
        <ThreadSidebar
          threads={threads}
          activeId={activeThreadId}
          onSelect={setActiveThreadId}
          onNew={handleNewThread}
          onDelete={handleDeleteThread}
        />
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border">
          <div>
            <h1 className="font-semibold">AI асистент</h1>
            <p className="text-xs text-muted-foreground">
              Запитай про свої фінанси українською
            </p>
          </div>
          <ModelPicker
            models={models.length > 0 ? models : [{ id: defaultModel, label: defaultModel, provider: 'anthropic', description: '' }]}
            value={selectedModel}
            onChange={setSelectedModel}
            disabled={isBusy}
          />
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        >
          {listError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm">
              {listError}
            </div>
          )}

          {loadingHistory && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          )}

          {!loadingHistory && messages.length === 0 && !isBusy && (
            <div className="h-full flex items-center justify-center">
              <SuggestedPrompts onPick={handleSend} />
            </div>
          )}

          {!loadingHistory &&
            messages.map((m) => <MessageBubble key={m.id} message={m} />)}

          {isBusy && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-2 text-sm text-muted-foreground items-center">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Асистент думає…
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm">
              {error.message}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(draft);
            }}
            className="flex gap-2 max-w-3xl mx-auto"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Напишіть повідомлення…"
              disabled={isBusy}
              className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {isBusy ? (
              <button
                type="button"
                onClick={stop}
                className="h-10 px-4 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90"
              >
                Стоп
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Відправити
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
