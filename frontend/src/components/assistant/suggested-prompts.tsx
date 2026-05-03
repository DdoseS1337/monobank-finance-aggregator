'use client';

const SUGGESTIONS = [
  'Скільки я витратив(ла) на їжу цього місяця?',
  'Чому цього місяця витрати більші?',
  'Які підписки у мене є?',
  'Де я витрачаю найбільше?',
  'Скільки буде витрачено до кінця місяця?',
  'Покажи аномальні витрати за останній тиждень',
];

interface Props {
  onPick: (prompt: string) => void;
}

export function SuggestedPrompts({ onPick }: Props) {
  return (
    <div className="max-w-2xl mx-auto px-4">
      <p className="text-sm text-muted-foreground text-center mb-4">
        Запитайте про ваші фінанси
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
