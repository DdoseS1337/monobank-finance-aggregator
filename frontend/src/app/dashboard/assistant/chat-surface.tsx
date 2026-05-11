'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  Bot,
  Check,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/shared/markdown';
import { cn } from '@/lib/utils';
import {
  confirmStagedAction,
  listChatSessions,
  loadChatSession,
  rejectStagedAction,
  sendChatAction,
} from './actions';
import type {
  ChatResponseDto,
  ChatSessionSummary,
  ChatTurnDto,
} from '@/lib/api';

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  agent?: ChatResponseDto['agent'];
  rationale?: string;
  toolCalls?: ChatResponseDto['toolCalls'];
  pendingConfirmations?: ChatResponseDto['pendingConfirmations'];
  costUsd?: number;
  flags?: string[];
  verification?: ChatResponseDto['verification'];
}

const SUGGESTIONS = [
  'Скільки я витратив на каву за останні 30 днів?',
  'Чи зможу я досягти цілі "Авто" вчасно?',
  'Створи бюджет з лімітом 10 000 ₴ на їжу',
  'Що якщо моя зарплата зросте на 15%?',
];

const AGENT_LABEL: Record<ChatResponseDto['agent'], string> = {
  analyst: 'Analyst',
  planner: 'Planner',
  forecaster: 'Forecaster',
  'guardrail-blocked': 'Guardrail',
};

const AGENT_ACCENT: Record<ChatResponseDto['agent'], string> = {
  analyst: 'border-primary/30 bg-primary/5',
  planner: 'border-emerald-500/30 bg-emerald-500/5',
  forecaster: 'border-cyan-500/30 bg-cyan-500/5',
  'guardrail-blocked': 'border-red-500/30 bg-red-500/5',
};

function turnsToMessages(turns: ChatTurnDto[]): MessageItem[] {
  const items: MessageItem[] = [];
  for (const t of turns) {
    if (!t.content) continue;
    if (t.role === 'USER') {
      items.push({ id: t.id, role: 'user', text: t.content });
    } else if (t.role === 'ASSISTANT') {
      items.push({ id: t.id, role: 'assistant', text: t.content });
    }
  }
  return items;
}

export function ChatSurface() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listChatSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, pending]);

  const refreshSessions = () => {
    listChatSessions()
      .then(setSessions)
      .catch(() => undefined);
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    setDraft('');
    const userId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: trimmed },
    ]);
    startTransition(async () => {
      try {
        const response = await sendChatAction({ message: trimmed, sessionId });
        const isNewSession = !sessionId;
        setSessionId(response.sessionId);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: response.text,
            agent: response.agent,
            rationale: response.rationale,
            toolCalls: response.toolCalls,
            pendingConfirmations: response.pendingConfirmations,
            costUsd: response.costUsd,
            flags: response.flags,
            verification: response.verification,
          },
        ]);
        if (isNewSession) refreshSessions();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка LLM');
      }
    });
  };

  const startNewChat = () => {
    if (pending) return;
    setSessionId(undefined);
    setMessages([]);
    setError(null);
  };

  const openSession = (id: string) => {
    if (pending || id === sessionId) return;
    setLoadingSession(true);
    setError(null);
    loadChatSession(id)
      .then((transcript) => {
        setSessionId(transcript.id);
        setMessages(turnsToMessages(transcript.turns));
      })
      .catch(() => setError('Не вдалося завантажити розмову'))
      .finally(() => setLoadingSession(false));
  };

  return (
    <div className="flex h-full">
      <SessionsSidebar
        sessions={sessions}
        currentId={sessionId}
        onPick={openSession}
        onNew={startNewChat}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
          {loadingSession ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Завантаження…
            </div>
          ) : messages.length === 0 ? (
            <Suggestions onPick={send} />
          ) : (
            <ul className="space-y-4">
              {messages.map((m) => (
                <li key={m.id}>
                  {m.role === 'user' ? (
                    <UserBubble text={m.text} />
                  ) : (
                    <AssistantBubble msg={m} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {pending && <PendingPlaceholder />}
        </div>

        {error && (
          <div className="border-t border-border px-5 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Запитайте про бюджет, ціль, прогноз або попросіть створити щось…"
            className="flex-1"
            disabled={pending}
            autoFocus
          />
          <Button type="submit" disabled={pending || !draft.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function SessionsSidebar({
  sessions,
  currentId,
  onPick,
  onNew,
}: {
  sessions: ChatSessionSummary[];
  currentId: string | undefined;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Розмови
        </span>
        <Button size="sm" variant="ghost" onClick={onNew}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Нова
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Поки що немає історії.
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => {
              const ts = s.lastTurnAt ?? s.startedAt;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onPick(s.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
                      currentId === s.id
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs">
                      <MessageSquare className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-2 text-xs leading-tight">
                        {s.title}
                      </span>
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {new Date(ts).toLocaleString('uk-UA', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      {' · '}
                      {s.turnCount} пов.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Чим допомогти?</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Я розумію контекст ваших фінансів. Спробуйте один із прикладів або
          введіть власне.
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-muted/30 p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-muted/50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 rounded-lg bg-muted/40 p-3 text-sm">{text}</div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: MessageItem }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex-1 space-y-3">
        <div
          className={cn(
            'rounded-lg border p-4 text-sm',
            AGENT_ACCENT[msg.agent ?? 'analyst'],
          )}
        >
          {msg.agent && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {AGENT_LABEL[msg.agent]}
              {msg.rationale ? ` · ${msg.rationale}` : ''}
            </p>
          )}
          <Markdown>{msg.text}</Markdown>
        </div>

        {msg.verification && msg.verification.total > 0 && (
          <VerificationBadge verification={msg.verification} />
        )}

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Tool calls ({msg.toolCalls.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {msg.toolCalls.map((c, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[11px]"
                >
                  <span className={c.ok ? 'text-emerald-600' : 'text-red-600'}>
                    {c.ok ? '✓' : '✗'}
                  </span>{' '}
                  {c.name}
                </li>
              ))}
            </ul>
          </details>
        )}

        {msg.pendingConfirmations && msg.pendingConfirmations.length > 0 && (
          <div className="space-y-2">
            {msg.pendingConfirmations.map((p) => (
              <ConfirmationCard key={p.stagedActionId} action={p} />
            ))}
          </div>
        )}

        {msg.costUsd !== undefined && msg.costUsd > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Cost: ${msg.costUsd.toFixed(6)}
          </p>
        )}
      </div>
    </div>
  );
}

function VerificationBadge({
  verification,
}: {
  verification: NonNullable<ChatResponseDto['verification']>;
}) {
  const { total, verified, unverified, retried } = verification;
  const allVerified = unverified === 0;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-[11px]',
        allVerified
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
      )}
    >
      <span className="font-semibold uppercase tracking-wide">
        {allVerified ? '✓ Перевірено' : '⚠ Часткова перевірка'}
      </span>
      <span className="font-mono">
        {verified}/{total} числових тверджень підкріплені tool-результатом
      </span>
      {retried && (
        <span className="rounded bg-current/10 px-1 py-0.5 font-mono text-[10px]">
          retry × 1
        </span>
      )}
      {!allVerified && verification.unverifiedClaims.length > 0 && (
        <details className="basis-full">
          <summary className="cursor-pointer">
            Непідтверджені: {verification.unverifiedClaims.length}
          </summary>
          <ul className="mt-1 ml-4 list-disc font-mono text-[10px]">
            {verification.unverifiedClaims.slice(0, 8).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PendingPlaceholder() {
  return (
    <div className="mt-4 flex items-center gap-3 px-1 text-sm text-muted-foreground">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-current" />
      </div>
    </div>
  );
}

interface ConfirmationProps {
  action: ChatResponseDto['pendingConfirmations'][number];
}

function ConfirmationCard({ action }: ConfirmationProps) {
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState<null | 'confirmed' | 'rejected'>(
    null,
  );

  const onConfirm = () => {
    startTransition(async () => {
      try {
        await confirmStagedAction(action.stagedActionId);
        setResolved('confirmed');
      } catch {
        setResolved(null);
      }
    });
  };
  const onReject = () => {
    startTransition(async () => {
      await rejectStagedAction(action.stagedActionId);
      setResolved('rejected');
    });
  };

  if (resolved) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        {resolved === 'confirmed' ? 'Дію виконано.' : 'Дію скасовано.'}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Підтвердіть дію — {action.toolName}
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-background/60 p-2 text-[11px] leading-relaxed text-foreground">
        {JSON.stringify(action.preview, null, 2)}
      </pre>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={onConfirm} disabled={pending}>
          <Check className="mr-1 h-3.5 w-3.5" /> Підтвердити
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={pending}>
          <X className="mr-1 h-3.5 w-3.5" /> Скасувати
        </Button>
      </div>
    </div>
  );
}
