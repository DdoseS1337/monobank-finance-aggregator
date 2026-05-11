'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateProfileAction } from './actions';
import type { UserProfileDto } from '@/lib/api';

const RISK = [
  { value: 'CONSERVATIVE', label: 'Консервативний' },
  { value: 'MODERATE', label: 'Помірний' },
  { value: 'AGGRESSIVE', label: 'Агресивний' },
] as const;

const LITERACY = [
  { value: 'BEGINNER', label: 'Початківець' },
  { value: 'INTERMEDIATE', label: 'Середній' },
  { value: 'EXPERT', label: 'Експерт' },
] as const;

const TONES = [
  { value: 'FORMAL', label: 'Формальний' },
  { value: 'FRIENDLY', label: 'Дружній' },
  { value: 'DIRECT', label: 'Прямий' },
] as const;

const CHANNELS = [
  { value: 'in_app', label: 'In-app inbox' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'telegram', label: 'Telegram' },
] as const;

export function ProfileForm({ initial }: { initial: UserProfileDto }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  const [risk, setRisk] = useState(initial.riskTolerance);
  const [literacy, setLiteracy] = useState(initial.financialLiteracyLevel);
  const [tone, setTone] = useState(initial.preferredTone);
  const [language, setLanguage] = useState(initial.preferredLanguage);
  const [channels, setChannels] = useState<string[]>(initial.preferredChannels);
  const [quietFrom, setQuietFrom] = useState(initial.quietHours?.from ?? '');
  const [quietTo, setQuietTo] = useState(initial.quietHours?.to ?? '');

  const toggleChannel = (value: string) =>
    setChannels((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setInfo(null);
    if (channels.length === 0) {
      setInfo('Виберіть хоча б один канал.');
      return;
    }
    startTransition(async () => {
      try {
        await updateProfileAction({
          riskTolerance: risk,
          financialLiteracyLevel: literacy,
          preferredTone: tone,
          preferredLanguage: language,
          preferredChannels: channels as UserProfileDto['preferredChannels'],
          quietHours:
            quietFrom && quietTo
              ? { from: quietFrom, to: quietTo }
              : null,
        });
        setInfo('Збережено.');
      } catch (err) {
        setInfo(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Толерантність до ризику</Label>
          <Select value={risk} onValueChange={(v) => setRisk(v as typeof risk)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RISK.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Фінансова грамотність</Label>
          <Select value={literacy} onValueChange={(v) => setLiteracy(v as typeof literacy)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LITERACY.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Тон рекомендацій</Label>
          <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Мова інтерфейсу</Label>
        <Select value={language} onValueChange={(v) => setLanguage(v as 'uk' | 'en')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uk">Українська</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Канали сповіщень</legend>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((c) => (
            <label
              key={c.value}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={channels.includes(c.value)}
                onChange={() => toggleChannel(c.value)}
                className="h-4 w-4"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quiet-from">Тихі години — від</Label>
          <Input
            id="quiet-from"
            type="time"
            value={quietFrom}
            onChange={(e) => setQuietFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quiet-to">Тихі години — до</Label>
          <Input
            id="quiet-to"
            type="time"
            value={quietTo}
            onChange={(e) => setQuietTo(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Не-критичні сповіщення відкладаються до закінчення тихих годин.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Збереження…' : 'Зберегти'}
        </Button>
        {info && <p className="text-xs text-muted-foreground">{info}</p>}
      </div>
    </form>
  );
}
