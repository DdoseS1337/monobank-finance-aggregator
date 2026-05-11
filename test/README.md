# Датасет персональних фінансових транзакцій

Синтетичний датасет для порівняльного експерименту:
**tool-use vs RAG vs text-to-SQL** у системах фінансової аналітики
з природномовним інтерфейсом.

## Що в архіві

| Файл               | Призначення                                                    |
| ------------------ | -------------------------------------------------------------- |
| `transactions.db`  | Готова SQLite БД, для **tool-use** та **text-to-SQL**         |
| `transactions.json`| Той самий датасет у JSON, для **RAG** (embedding'ів)         |
| `schema.sql`       | DDL схеми — у системний промпт text-to-SQL                    |
| `generate_data.py` | Скрипт-генератор, `seed=42`, регенерація завжди ідентична     |

## Характеристики

- Період: **01.01.2026 – 30.04.2026** (4 місяці)
- 285 транзакцій
- Дохід: 260 000 UAH (зарплата 2x на місяць)
- Витрати: 162 917 UAH (~40 700 / місяць)
- Категорії: salary, groceries, coffee, restaurants, transport, utilities,
  subscriptions, fitness, shopping, health, entertainment, other_services
- 7 рекурентних підписок (Netflix, Spotify, Megogo, iCloud, Notion,
  Київстар Інтернет, SportLife) — кожна 4 транзакції
- 5 «викидів» — навмисно великі покупки для тестів топ-N та виявлення аномалій

## Схема БД

```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    transaction_date TEXT NOT NULL,    -- 'YYYY-MM-DD'
    amount REAL NOT NULL,              -- негативне = витрата, позитивне = дохід
    currency TEXT DEFAULT 'UAH',
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    payment_method TEXT,
    description TEXT NOT NULL,         -- natural language, потрібне для RAG
    is_recurring INTEGER DEFAULT 0     -- 0 / 1
);
```

## Як підняти

### Tool-use (ваша існуюча система)

```python
import sqlite3
conn = sqlite3.connect("transactions.db")
# ваші функції-tools викликають parameterized queries проти conn
```

### Text-to-SQL

```python
import sqlite3, openai
SCHEMA = open("schema.sql").read()

def answer(question: str) -> str:
    sql_prompt = f"""You are a SQL assistant. Given the schema:

{SCHEMA}

Generate a single SQLite query for the question (Ukrainian).
Return ONLY the SQL, no markdown, no explanation.

Question: {question}"""
    sql = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": sql_prompt}],
    ).choices[0].message.content.strip()

    rows = sqlite3.connect("transactions.db").execute(sql).fetchall()
    final_prompt = (f"Question: {question}\nSQL result: {rows}\n"
                    f"Answer in Ukrainian, concisely.")
    return openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": final_prompt}],
    ).choices[0].message.content
```

### RAG

```python
import json
data = json.load(open("transactions.json"))

# Денормалізація транзакції в текст для embedding'а
def to_doc(t):
    sign = "Дохід" if t["amount"] > 0 else "Витрата"
    return (f"{t['transaction_date']}: {sign} {abs(t['amount']):.2f} UAH "
            f"у '{t['merchant']}' (категорія: {t['category']}). "
            f"{t['description']}. Оплата: {t['payment_method']}.")

docs = [to_doc(t) for t in data]
# далі — embed, vector store, retrieve top-k, передати в LLM з питанням
```

## Регенерація

```bash
python3 generate_data.py [output_dir]
```

`random.seed(42)` фіксований у скрипті — результат завжди ідентичний.

## Що залишилось зробити

1. **Golden dataset** — питання + правильні відповіді для оцінки систем
2. Реалізація RAG і text-to-SQL клієнтів
3. Прогін кожного питання через всі три системи
4. Таблиця метрик: accuracy, completeness, latency, cost
