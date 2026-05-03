export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const CURRENCY_MAP: Record<number, { code: string; symbol: string }> = {
  980: { code: 'UAH', symbol: '₴' },
  840: { code: 'USD', symbol: '$' },
  978: { code: 'EUR', symbol: '€' },
  826: { code: 'GBP', symbol: '£' },
  985: { code: 'PLN', symbol: 'zł' },
};

export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f97316',
  Transport: '#3b82f6',
  Entertainment: '#a855f7',
  Health: '#ef4444',
  Shopping: '#ec4899',
  Utilities: '#6366f1',
  Education: '#14b8a6',
  Travel: '#06b6d4',
  Beauty: '#f43f5e',
  Housing: '#d97706',
  Pets: '#84cc16',
  Services: '#64748b',
  Auto: '#0ea5e9',
  Subscriptions: '#f59e0b',
  Investments: '#10b981',
  Insurance: '#8b5cf6',
  Government: '#475569',
  Charity: '#fb7185',
  Cash: '#facc15',
  Transfers: '#38bdf8',
  Other: '#94a3b8',
};

export const CATEGORY_LABELS: Record<string, string> = {
  Food: 'Їжа та напої',
  Transport: 'Транспорт',
  Entertainment: 'Розваги',
  Health: "Здоров'я",
  Shopping: 'Покупки',
  Utilities: 'Комунальні',
  Education: 'Освіта',
  Travel: 'Подорожі',
  Beauty: 'Краса',
  Housing: 'Житло',
  Pets: 'Тварини',
  Services: 'Послуги',
  Auto: 'Авто',
  Subscriptions: 'Підписки',
  Investments: 'Інвестиції',
  Insurance: 'Страхування',
  Government: 'Держ. послуги',
  Charity: 'Благодійність',
  Cash: 'Готівка',
  Transfers: 'Перекази',
  Other: 'Інше',
};

export const DEFAULT_CATEGORY_COLOR = '#94a3b8';

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
