'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createRuleFromTemplateAction } from './actions';
import type { RuleTemplateDto } from '@/lib/api';

export function TemplatePicker({ templates }: { templates: RuleTemplateDto[] }) {
  const [active, setActive] = useState<RuleTemplateDto | null>(null);
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {templates.map((t) => (
          <li key={t.templateId}>
            <button
              onClick={() => setActive(t)}
              className="w-full rounded-lg border border-border/50 bg-muted/20 p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <p className="font-medium">{t.title}</p>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
            </button>
          </li>
        ))}
      </ul>
      {active && (
        <ConfigureTemplate
          template={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function ConfigureTemplate({
  template,
  onClose,
}: {
  template: RuleTemplateDto;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const missing = template.params
      .filter((p) => p.required && !values[p.key])
      .map((p) => p.key);
    if (missing.length > 0) {
      setError(`Заповніть: ${missing.join(', ')}`);
      return;
    }
    startTransition(async () => {
      try {
        await createRuleFromTemplateAction({
          templateId: template.templateId,
          values: castValues(values, template),
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="text-sm font-semibold">{template.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
      {template.params.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {template.params.map((p) => (
            <div key={p.key} className="space-y-1">
              <Label htmlFor={`tpl-${p.key}`} className="text-xs">
                {p.label} {p.required && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id={`tpl-${p.key}`}
                value={values[p.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                placeholder={hintFor(p.kind)}
                inputMode={p.kind === 'percent' || p.kind === 'amount' || p.kind === 'mccCode' ? 'decimal' : 'text'}
                className="h-8"
              />
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Створення…' : 'Створити правило'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Скасувати
        </Button>
      </div>
    </form>
  );
}

function hintFor(kind: RuleTemplateDto['params'][number]['kind']): string {
  switch (kind) {
    case 'goalId':
      return 'UUID цілі';
    case 'envelopeId':
      return 'UUID envelope';
    case 'percent':
      return '20';
    case 'amount':
      return '1500';
    case 'currency':
      return 'UAH';
    case 'mccCode':
      return '5411';
    default:
      return '';
  }
}

function castValues(
  raw: Record<string, string>,
  template: RuleTemplateDto,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const param of template.params) {
    const v = raw[param.key];
    if (v === undefined || v === '') continue;
    if (param.kind === 'percent' || param.kind === 'amount' || param.kind === 'mccCode') {
      out[param.key] = Number(v);
    } else {
      out[param.key] = v;
    }
  }
  return out;
}
