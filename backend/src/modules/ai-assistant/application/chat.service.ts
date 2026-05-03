import { Injectable, Logger } from '@nestjs/common';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import type { ServerResponse } from 'http';
import { AiThreadRepository } from '../infrastructure/ai-thread.repository';
import { ModelRegistry, DEFAULT_MODEL } from '../infrastructure/model-registry';
import { ToolFactoryService } from './tool-factory.service';
import type { AiModelId } from '../domain/ai.interfaces';

const MONTHS_UA = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
const WEEKDAYS_UA = [
  'неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота',
];

/** Build system prompt fresh for each request so the date is always current. */
function buildSystemPrompt(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  const iso = now.toISOString().slice(0, 10);
  const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  const prevMonthStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const prevMonthEnd = new Date(year, month, 0).toISOString().slice(0, 10);
  const weekday = WEEKDAYS_UA[now.getDay()];

  return `Ти — фінансовий асистент у застосунку, який агрегує транзакції користувача з Monobank.

## Поточна дата
Сьогодні: **${day} ${MONTHS_UA[month]} ${year} року** (${weekday}), ISO = ${iso}.
Використовуй ЦЮ дату як "сьогодні" у всіх розрахунках. Не покладайся на свої внутрішні знання про дату.

Готові періоди:
- "цього місяця" → from=${monthStart}, to=${iso}
- "цей місяць повністю" → from=${monthStart}, to=${monthEnd}
- "минулого місяця" → from=${prevMonthStart}, to=${prevMonthEnd}
- "за останні N днів" → from=(${iso} мінус N днів), to=${iso}
- Якщо дата не вказана — зазвичай беремо поточний місяць (${monthStart} → ${iso})

## Твоя задача
1. Відповідати на питання про фінанси користувача — витрати, доходи, категорії, підписки, тренди.
2. Використовувати доступні інструменти (tools), щоб отримати актуальні дані з бази. НІКОЛИ не вигадуй цифри.
3. Пояснювати причини змін у витратах (порівнюй періоди через get_period_comparison).
4. Давати короткі, практичні рекомендації коли це доречно.
5. Відповідати українською, лаконічно, з конкретними числами.

## Структура даних
Усі цифри, які повертають інструменти, беруться з таблиці \`transactions\`:
- **amount** — сума в валюті \`currency\`. Для DEBIT (витрата) — завжди від'ємна, для CREDIT (дохід) — додатна. Інструменти повертають уже нормалізовані (позитивні) значення.
- **transactionType** — 'DEBIT' (витрата), 'CREDIT' (дохід), 'TRANSFER', 'HOLD' (зарезервовані — зараз не використовуємо).
- **mccCategory** — нормалізована категорія витрати (напр. "Food", "Transport", "Shopping"). Діє лише для DEBIT.
- **merchantNameClean** — чистий мерчант ("Starbucks", "Netflix"). Для CREDIT тут зазвичай пусто.
- **descriptionRaw** — сирий опис від банку. Для CREDIT тут може бути джерело доходу ("Зарплата", "Від Івана", "Повернення податку").
- **transactionTime** — момент транзакції (timestamp).

## Яким інструментом відповідати
- "скільки я заробив" / "дохід за період" / "звідки гроші" → **get_income_summary** (не get_summary, той лише за поточний місяць).
- "скільки я витратив на X" / "структура витрат" → **get_spending_by_category**.
- "де витрачаю найбільше" / "топ магазинів" → **get_top_merchants**.
- "чому витрати більші" / "що змінилось" → **get_period_comparison** (порівняння двох періодів).
- "підписки" / "щомісячні платежі" → **get_subscriptions** або **get_recurring_expenses**.
- "аномалії" / "щось дивне" → **get_insights**.
- "скільки вистачить грошей" / "прогноз" → **get_end_of_month_projection**, **get_burn_rate**.
- Конкретний мерчант ("чи платив я Netflix у червні") → **search_transactions** з query.

## Правила форматування
- Суми пиши як "1 234,56 ₴" (з пробілом-розділювачем тисяч та комою як десятковим).
- Дати як "${day} ${MONTHS_UA[month]} ${year}" або ISO (YYYY-MM-DD) якщо це технічна інформація.
- Використовуй короткі списки та bold (**жирний**) для головних чисел.
- Не дублюй дані таблицею якщо вже розповів текстом.

Якщо потрібно виконати кілька запитів (напр. порівняти періоди) — спочатку отримай дані, потім поясни. Не питай зайвого у користувача, якщо можеш підставити розумні дефолти.`;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly threadRepo: AiThreadRepository,
    private readonly modelRegistry: ModelRegistry,
    private readonly toolFactory: ToolFactoryService,
  ) {}

  /**
   * Handles one chat turn: loads thread history, appends the new user message,
   * streams the assistant response through the AI SDK tool-use loop, and
   * persists the final assistant message.
   */
  async chat(params: {
    userId: string;
    threadId: string;
    messages: UIMessage[];
    model?: AiModelId;
    res: ServerResponse;
  }): Promise<void> {
    const { userId, threadId, messages, res } = params;
    const modelId = params.model ?? DEFAULT_MODEL;

    // Verify thread belongs to user
    await this.threadRepo.findByIdForUser(threadId, userId);

    // Persist only the last user message (history was already saved previously)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      await this.threadRepo.appendMessage(threadId, 'user', lastMessage.parts);
    }

    // Update thread meta — last-used model + auto-title from first user message
    const existing = await this.threadRepo.findByIdForUser(threadId, userId);
    const updates: { title?: string; model?: string } = { model: modelId };
    if (!existing.title && lastMessage?.role === 'user') {
      updates.title = this.deriveTitle(lastMessage);
    }
    await this.threadRepo.updateMeta(threadId, updates);

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: this.modelRegistry.resolve(modelId),
      system: buildSystemPrompt(),
      messages: modelMessages,
      tools: this.toolFactory.forUser(userId),
      stopWhen: stepCountIs(8),
      onFinish: async (event) => {
        // Persist the final aggregated assistant text. Tool calls were visible
        // to the user live during streaming; we keep stored history text-only
        // to make reloads simple and cheap.
        if (event.text && event.text.trim().length > 0) {
          await this.threadRepo.appendMessage(threadId, 'assistant', [
            { type: 'text', text: event.text },
          ]);
        }
      },
      onError: (err) => {
        this.logger.error('streamText error', err);
      },
    });

    pipeUIMessageStreamToResponse({
      response: res,
      stream: result.toUIMessageStream(),
    });
  }

  /** Create a short, UA-friendly thread title from the first user message. */
  private deriveTitle(msg: UIMessage): string {
    const text = msg.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .trim();
    if (!text) return 'Нова розмова';
    return text.length > 60 ? text.slice(0, 57) + '…' : text;
  }

}
