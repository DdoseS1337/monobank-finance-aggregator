'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface TokenFormProps {
  onSubmit: (token: string) => void;
}

export function TokenForm({ onSubmit }: TokenFormProps) {
  const [value, setValue] = useState('');
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Підключення до Monobank</CardTitle>
        <CardDescription>
          Введіть ваш персональний токен для доступу до даних.
          Отримати токен можна в{' '}
          <a
            href="https://api.monobank.ua/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            особистому кабінеті Monobank API
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">Персональний токен</Label>
            <div className="relative">
              <Input
                id="token"
                type={showToken ? 'text' : 'password'}
                placeholder="Вставте ваш токен…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="pr-20"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showToken ? 'Сховати' : 'Показати'}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!value.trim()}>
            Підключити
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
