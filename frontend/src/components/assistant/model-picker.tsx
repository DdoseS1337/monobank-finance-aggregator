'use client';

import type { AiModelId, AiModelMeta } from '@/lib/types';

interface Props {
  models: AiModelMeta[];
  value: AiModelId;
  onChange: (value: AiModelId) => void;
  disabled?: boolean;
}

export function ModelPicker({ models, value, onChange, disabled = false }: Props) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as AiModelId)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[200px] truncate"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
