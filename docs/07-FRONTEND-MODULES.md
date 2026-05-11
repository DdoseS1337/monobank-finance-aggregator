# 07. Frontend модулі (Next.js)

## 1. Інформаційна архітектура

```
┌──────────────────────────────────────────────────────────┐
│ TopNav: Dashboard | Spending | Budgets | Goals |        │
│         Cashflow | Insights | Assistant                  │
└──────────────────────────────────────────────────────────┘

Pages:
1. /dashboard              ← single-pane health view
2. /transactions           ← existing
3. /spending               ← existing analytics
4. /budgets                ← NEW
5. /budgets/:id            ← detail з envelope ladder
6. /goals                  ← NEW
7. /goals/:id              ← progress, simulator
8. /cashflow               ← NEW (projection chart, deficits)
9. /scenarios              ← NEW (what-if sandbox)
10. /insights              ← existing + recommendations feed
11. /recommendations       ← NEW (Inbox-style)
12. /rules                 ← NEW (automation studio)
13. /assistant             ← existing AI chat (refactored)
14. /subscriptions         ← existing
15. /settings/personalization
16. /settings/notifications
```

## 2. Структура проєкту

```
frontend/src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── transactions/
│   │   ├── spending/
│   │   ├── budgets/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── new/page.tsx
│   │   ├── goals/
│   │   ├── cashflow/
│   │   ├── scenarios/
│   │   ├── recommendations/
│   │   ├── rules/
│   │   ├── assistant/
│   │   └── settings/
│   └── layout.tsx
├── modules/
│   ├── budgeting/
│   │   ├── components/
│   │   │   ├── BudgetCard.tsx
│   │   │   ├── BudgetCreator.tsx
│   │   │   ├── EnvelopeLadder.tsx
│   │   │   ├── BurnRateGauge.tsx
│   │   │   └── BudgetMethodSelector.tsx
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── goals/
│   ├── cashflow/
│   ├── recommendations/
│   ├── rules/
│   ├── assistant/
│   │   ├── components/
│   │   │   ├── ChatThread.tsx
│   │   │   ├── ToolCallTimeline.tsx
│   │   │   ├── ActionChips.tsx
│   │   │   ├── ConfirmationDialog.tsx
│   │   │   └── ExplanationPanel.tsx
│   │   └── ...
│   └── personalization/
├── shared/
│   ├── components/
│   │   ├── HealthScoreBadge.tsx
│   │   ├── ExplanationTooltip.tsx
│   │   ├── MoneyDisplay.tsx
│   │   └── ConfidenceMeter.tsx
│   ├── hooks/
│   └── lib/
└── server/                   // Next.js Route Handlers / Server Actions
```

## 3. Ключові UX-патерни

### Financial Health Score (на dashboard)

**Composite KPI** (0–100):
- Savings rate (вага 25%)
- Budget adherence (25%)
- Goal feasibility average (20%)
- Emergency fund coverage (15%)
- Subscription efficiency (10%)
- Cashflow stability (5%)

Візуалізація — кругова шкала з breakdown при hover.

### Recommendation Inbox

Gmail-style:
```
┌──────────────────────────────────────────────────────────┐
│ ⚡ Дефіцит за 18 днів — пропоную 3 кроки    [Action] [→] │
│ 💡 Підписка Spotify: 60 днів неактивна       [Cancel] [→]│
│ 🎯 Ціль 'Авто' під ризиком                   [Adjust] [→]│
└──────────────────────────────────────────────────────────┘

Filters: All | Spending | Saving | Goals | Cashflow
Bulk actions: Mark all read | Snooze | Reject
Per-item: Accept | Modify | Reject | Snooze | Why?
```

### Scenario Sandbox

```
┌────────────────────────────────────────┐
│ Baseline cashflow ──── (chart)         │
│ Modified cashflow ─ ─ ─ (overlay)      │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ Variables                              │
│ • Add goal "Trip"     [ + ] +50 000 ₴  │
│ • Increase income     [|||||] +5 000 ₴ │
│ • Reduce category 'Eat' [-30%]         │
│                                        │
│ [Real-time projection updates]         │
│                                        │
│ Outcomes:                              │
│ • Savings rate: 18% → 12% (-6%)        │
│ • Emergency fund coverage: 4mo → 3mo   │
│ • Earliest deficit: D+18 → D+45        │
└────────────────────────────────────────┘
```

### Envelope Ladder

Vertical bars з overflow visual:
```
Продукти    ████████░░ 80%   2 400 / 3 000 ₴
Транспорт   ██████████ 100%! 1 200 / 1 200 ₴  ⚠️
Розваги     ███░░░░░░░ 30%     600 / 2 000 ₴
Накопичення ████░░░░░░ 40%   2 000 / 5 000 ₴
```

Drag-and-drop для transfer між envelopes.

### Goal Tracker з ETA badge

```
┌────────────────────────────────────────────┐
│ 🚗 Авто на €5 000                          │
│ ████████░░░░░░░ 53%   2 650 / 5 000 €      │
│ ETA: травень 2027 (на 2 місяці пізніше)   │
│ Feasibility: 76% [▼]                       │
│ [Add money] [Adjust] [Simulate]            │
└────────────────────────────────────────────┘
```

### AI Chat з action chips

```
┌──────────────────────────────────────────────┐
│ User: Створи мені план накопичень на авто    │
│                                              │
│ Assistant: Розумію. Ціль 5 000 € за 24 міс?  │
│ [✓ Так]  [Ні, інші параметри]                │
│                                              │
│ → User: Так                                  │
│                                              │
│ Assistant: Пропоную:                         │
│ • Створити ціль 'Авто'                       │
│ • Налаштувати rule: 15% з зарплати           │
│ • Створити envelope 'Авто'                   │
│                                              │
│ Очікуваний impact: +2 080 €/рік              │
│ [✓ Виконати все] [Налаштувати] [Скасувати]   │
└──────────────────────────────────────────────┘
```

### Explanation everywhere

Кожна цифра/recommendation має `?` icon → opens panel:
```
┌────────────────────────────────────────────┐
│ Why this recommendation?                   │
│                                            │
│ Inputs used:                               │
│ • Average monthly savings: 2 100 ₴         │
│ • Goal target: 50 000 ₴                    │
│ • Deadline: 24 місяці                      │
│ • Risk tolerance: Moderate                 │
│                                            │
│ Reasoning:                                 │
│ At current pace, completion ETA = 24 mo    │
│ із вірогідністю 76%. Запропоновано        │
│ збільшити contribution на 15%, що дає     │
│ ETA = 21 mo із вірогідністю 91%.          │
│                                            │
│ Alternatives considered:                   │
│ • Extend deadline by 3 mo (rejected: user │
│   prefers tight deadlines)                 │
│ • Reduce target by 10% (rejected: would    │
│   require buying lower-spec model)         │
│                                            │
│ Generated by: hybrid (rules + LLM)         │
│ Confidence: 0.82                           │
└────────────────────────────────────────────┘
```

## 4. Component design system

Компоненти, які потрібно створити (на базі existing UI library, наприклад Radix + Tailwind):

```
- HealthScoreBadge: composite KPI display
- BurnRateGauge: % spent vs % time elapsed з кольорами
- EnvelopeBar: progress bar з overflow handling
- GoalProgressRing: circular progress
- CashflowChart: line chart з confidence bands (Recharts/Chart.js)
- ScenarioSlider: numeric input з real-time preview
- ConfirmationDialog: для two-step mutations
- ExplanationPanel: collapsible side panel
- ConfidenceMeter: visual confidence indicator
- ToolCallTimeline: для transparency у chat
- ActionChip: clickable suggested action
- MoneyDisplay: currency-aware formatting
- TrendArrow: ↑↓→ з % change
- RecommendationCard: для Inbox
- RuleBuilder: AST-aware rule UI
```

## 5. State management

```
- React Server Components для read-heavy pages (dashboard, lists)
- Client components тільки де є interactivity
- Server Actions для mutations (з staged_actions confirmation flow)
- TanStack Query для client-side caching де треба
- Zustand для UI state (modals, sidebars, filters)
- Real-time updates через Supabase Realtime (для notifications, recommendations)
```

## 6. Real-time updates

```typescript
// Підписка на нові рекомендації
useEffect(() => {
  const channel = supabase
    .channel('recommendations')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'recommendations',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      // Show toast
      // Refresh inbox
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}, [userId]);
```

## 7. Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation для всіх actions
- Screen reader friendly (ARIA labels)
- Color blindness — не покладатись лише на колір (іконки + текст)
- Reduced motion respect

## 8. i18n / localization

- **Primary:** ukrainian
- **Secondary:** english (для тексту в роботі і інтернаціоналізації)
- Currency formatting: `Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' })`
- Date formatting: `Intl.DateTimeFormat('uk-UA')`
- AI responses в preferred language з UserProfile

## 9. Mobile responsiveness

- Mobile-first для core flows (review recommendations, check budget, log expense)
- Bottom navigation на мобільних
- Swipe actions для recommendation Inbox (accept / reject)
- PWA-ready (offline read + queued actions)

## 10. Performance budgets

| Page | LCP | TTI | Bundle (gzipped) |
|---|---|---|---|
| `/dashboard` | < 1.5s | < 2.5s | < 200 KB |
| `/transactions` | < 2s | < 3s | < 250 KB |
| `/assistant` | < 2s | < 3s | < 300 KB |
| Інші | < 2s | < 3s | < 250 KB |

Code splitting per route, lazy load для важких компонентів (charts, AI chat).
