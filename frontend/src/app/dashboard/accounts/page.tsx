import { redirect } from 'next/navigation';
import { Coins } from 'lucide-react';
import { accountsApi, fxApi, getServerToken } from '@/lib/api';
import type { FxRateDto } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MoneyDisplay } from '@/components/shared/money-display';
import { sumInCurrency } from '@/lib/fx';
import { cn } from '@/lib/utils';
import { LinkMonobankCard } from './link-monobank-card';
import { AccountActions } from './account-actions';

export const dynamic = 'force-dynamic';

const PRIMARY = 'UAH';

export default async function AccountsPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const [accounts, fxRates] = await Promise.all([
    accountsApi.list(token).catch(() => []),
    fxApi.rates(token).catch(() => [] as FxRateDto[]),
  ]);

  const positive = accounts.filter((a) => Number(a.balance) > 0);
  const negative = accounts.filter((a) => Number(a.balance) < 0);
  const totalUah = sumInCurrency(
    accounts.map((a) => ({ amount: a.balance, currency: a.currency })),
    PRIMARY,
    fxRates,
  );
  const assetsUah = sumInCurrency(
    positive.map((a) => ({ amount: a.balance, currency: a.currency })),
    PRIMARY,
    fxRates,
  );
  const debtUah = sumInCurrency(
    negative.map((a) => ({ amount: a.balance, currency: a.currency })),
    PRIMARY,
    fxRates,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Рахунки"
        description="Підключіть Monobank-токен — система імпортує всі sub-accounts і зберігатиме токен для подальшої синхронізації."
      />

      {accounts.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Чистий баланс"
            note={`Сума всіх рахунків у ${PRIMARY}`}
            valueClass={cn(
              totalUah < 0 && 'text-red-600',
              totalUah > 0 && 'text-emerald-600',
            )}
          >
            <MoneyDisplay amount={totalUah} currency={PRIMARY} />
          </SummaryCard>
          <SummaryCard
            label="Активи"
            note={`${positive.length} рахунк${plural(positive.length)} в плюс`}
            valueClass="text-emerald-600"
          >
            <MoneyDisplay amount={assetsUah} currency={PRIMARY} />
          </SummaryCard>
          <SummaryCard
            label="Заборгованість"
            note={
              negative.length === 0
                ? 'Немає від\'ємних балансів'
                : `${negative.length} рахунк${plural(negative.length)} в мінус`
            }
            valueClass={negative.length > 0 ? 'text-red-600' : undefined}
          >
            <MoneyDisplay
              amount={Math.abs(debtUah)}
              currency={PRIMARY}
            />
          </SummaryCard>
        </section>
      )}

      <LinkMonobankCard />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="Жодного підключеного рахунку"
          description="Перейдіть за посиланням api.monobank.ua → отримайте токен → вставте сюди."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {accounts.map((a) => {
            const balance = Number(a.balance);
            const isDebt = balance < 0;
            return (
              <li
                key={a.id}
                className={cn(
                  'rounded-xl border bg-card p-5',
                  isDebt
                    ? 'border-red-500/40 bg-red-500/5'
                    : 'border-border',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.provider} · {a.type} · підключено{' '}
                      {new Date(a.linkedAt).toLocaleDateString('uk-UA', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <p
                      className={cn(
                        'text-lg font-semibold tabular-nums',
                        isDebt && 'text-red-600',
                        balance > 0 && 'text-foreground',
                      )}
                    >
                      <MoneyDisplay amount={a.balance} currency={a.currency} />
                    </p>
                    {a.currency !== PRIMARY && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        ≈{' '}
                        <MoneyDisplay
                          amount={sumInCurrency(
                            [{ amount: a.balance, currency: a.currency }],
                            PRIMARY,
                            fxRates,
                          )}
                          currency={PRIMARY}
                        />
                      </p>
                    )}
                    {isDebt && (
                      <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                        Заборгованість
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <AccountActions accountId={a.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  note,
  children,
  valueClass,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn('mt-2 text-2xl font-semibold tabular-nums', valueClass)}
      >
        {children}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function plural(count: number): string {
  if (count === 1) return '';
  if (count >= 2 && count <= 4) return 'и';
  return 'ів';
}
