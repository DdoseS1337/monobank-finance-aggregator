'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  value: string;
}

export function CopyId({ value }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / insecure contexts: silently no-op.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Скопіювати ID"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="select-all">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
