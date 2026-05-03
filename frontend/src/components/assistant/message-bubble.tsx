'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';

interface Props {
  message: UIMessage;
}

/**
 * Renders a single chat message. Handles multiple part types:
 *  - text: prose bubble
 *  - tool-<name>: collapsible card showing the tool call and result
 *  - reasoning / other: ignored for now
 */
export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      )}

      <div className={cn('min-w-0 max-w-[85%] space-y-2', isUser && 'order-1')}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            // User messages stay as plain text (preserve their formatting).
            // Assistant messages go through markdown so **bold**, lists and
            // tables render properly.
            return (
              <div
                key={i}
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm break-words',
                  isUser
                    ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
                    : 'bg-muted text-foreground markdown-body',
                )}
              >
                {isUser ? (
                  part.text
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.text}
                  </ReactMarkdown>
                )}
              </div>
            );
          }

          // Tool invocation parts — AI SDK v6 emits them as `tool-<name>`
          if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
            return <ToolCard key={i} part={part} />;
          }

          return null;
        })}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}
    </div>
  );
}

function ToolCard({ part }: { part: Record<string, unknown> }) {
  const toolName =
    typeof part.type === 'string' ? part.type.replace(/^tool-/, '') : 'tool';
  const state = (part.state as string | undefined) ?? 'input-streaming';
  const isRunning = state === 'input-streaming' || state === 'input-available';

  // AI SDK may set these fields to `undefined` on parts that haven't reached
  // that state yet — `'key' in obj` is true even for undefined values, so we
  // must check the actual value is meaningful before rendering.
  const hasInput = part.input != null;
  const hasOutput = part.output !== undefined && part.output !== null;
  const errorText =
    typeof part.errorText === 'string' && part.errorText.length > 0
      ? part.errorText
      : null;

  return (
    <details className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none flex items-center gap-2">
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full',
            errorText
              ? 'bg-red-500'
              : isRunning
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-green-500',
          )}
        />
        <span className="font-mono text-muted-foreground">{toolName}</span>
        <span className="text-muted-foreground">
          {errorText ? 'помилка' : isRunning ? 'виконується…' : 'готово'}
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        {hasInput && (
          <div>
            <p className="text-muted-foreground mb-1">Запит:</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px]">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
        )}
        {hasOutput && (
          <div>
            <p className="text-muted-foreground mb-1">Результат:</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto max-h-60 text-[11px]">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          </div>
        )}
        {errorText && <p className="text-red-400">{errorText}</p>}
      </div>
    </details>
  );
}
