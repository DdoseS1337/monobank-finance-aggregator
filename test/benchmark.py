"""
Прогін golden dataset через 3 системи: tool-use vs text-to-SQL vs RAG.

Запуск:
    set OPENAI_API_KEY=sk-...
    python benchmark.py --repeats 2

Вихід:
    results.json     — повні дані по кожному виклику
    results.csv      — рядок на (question, system, repeat)
    metrics.md       — фінальна таблиця 4×3 (markdown)
    rag_embeddings.npz — кеш ембедингів транзакцій
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from openai import OpenAI

ROOT = Path(__file__).parent
DB_PATH = ROOT / "transactions.db"
SCHEMA_PATH = ROOT / "schema.sql"
DATA_PATH = ROOT / "transactions.json"
GOLDEN_PATH = ROOT / "golden_dataset.json"
EMB_CACHE_PATH = ROOT / "rag_embeddings.npz"

CHAT_MODEL = "gpt-4o-mini"
EMB_MODEL = "text-embedding-3-small"

# USD per 1M tokens
PRICE = {
    "gpt-4o-mini": (0.15, 0.60),  # (input, output)
    "text-embedding-3-small": (0.02, 0.0),
}

RAG_TOP_K = 25
MAX_TOOL_ITER = 6

_client: OpenAI | None = None


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


# ---------------------------------------------------------------------------
# Загальні утиліти
# ---------------------------------------------------------------------------

def cost_chat(usage) -> float:
    inp, out = PRICE[CHAT_MODEL]
    return (usage.prompt_tokens * inp + usage.completion_tokens * out) / 1_000_000


def cost_emb(tokens: int) -> float:
    inp, _ = PRICE[EMB_MODEL]
    return tokens * inp / 1_000_000


def db_query(sql: str, params: tuple = ()) -> list[tuple]:
    with sqlite3.connect(str(DB_PATH)) as c:
        return c.execute(sql, params).fetchall()


def parse_json(text: str) -> dict:
    """Витягує JSON з відповіді моделі, навіть якщо обгорнутий у ```."""
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {"answer_uk": text}


ANSWER_SCHEMA_PROMPT = """Поверни ТІЛЬКИ валідний JSON у такому форматі (поля, які не стосуються питання — null):
{
  "answer_uk": "коротка відповідь українською",
  "numeric_value": <число | null>,
  "items": [{"merchant": "...", "amount": <число>, "date": "YYYY-MM-DD", "description": "..."}] | null,
  "merchants": ["..."] | null,
  "category": "..." | null,
  "month": "YYYY-MM" | null,
  "values": {"key1": <число>, "key2": <число>} | null,
  "winner": "..." | null,
  "pct_change": <число> | null,
  "direction": "increase" | "decrease" | null
}
Якщо даних немає або питання не має відповіді — поверни numeric_value=0 і вкажи це у answer_uk."""


# ---------------------------------------------------------------------------
# Система 1: Tool-use
# ---------------------------------------------------------------------------

def tool_get_spending(category: str | None = None, start_date: str | None = None,
                     end_date: str | None = None, merchant: str | None = None) -> dict:
    sql = "SELECT COALESCE(ROUND(SUM(-amount), 2), 0) FROM transactions WHERE amount < 0"
    params: list = []
    if category:
        sql += " AND category = ?"; params.append(category)
    if merchant:
        sql += " AND merchant LIKE ?"; params.append(f"%{merchant}%")
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    total = db_query(sql, tuple(params))[0][0]
    return {"total_spent": total}


def tool_get_income(category: str | None = None, start_date: str | None = None,
                   end_date: str | None = None) -> dict:
    sql = "SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM transactions WHERE amount > 0"
    params: list = []
    if category:
        sql += " AND category = ?"; params.append(category)
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    return {"total_income": db_query(sql, tuple(params))[0][0]}


def tool_count_transactions(category: str | None = None, merchant: str | None = None,
                            start_date: str | None = None, end_date: str | None = None,
                            only_expenses: bool = False) -> dict:
    sql = "SELECT COUNT(*) FROM transactions WHERE 1=1"
    params: list = []
    if only_expenses:
        sql += " AND amount < 0"
    if category:
        sql += " AND category = ?"; params.append(category)
    if merchant:
        sql += " AND merchant LIKE ?"; params.append(f"%{merchant}%")
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    return {"count": db_query(sql, tuple(params))[0][0]}


def tool_get_top_expenses(n: int = 5, category: str | None = None,
                          start_date: str | None = None, end_date: str | None = None) -> dict:
    sql = """SELECT transaction_date, merchant, ROUND(-amount, 2), description, category
             FROM transactions WHERE amount < 0"""
    params: list = []
    if category:
        sql += " AND category = ?"; params.append(category)
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    sql += " ORDER BY amount ASC LIMIT ?"; params.append(int(n))
    rows = db_query(sql, tuple(params))
    return {"items": [
        {"date": r[0], "merchant": r[1], "amount": r[2], "description": r[3], "category": r[4]}
        for r in rows
    ]}


def tool_get_spending_by_category(start_date: str | None = None, end_date: str | None = None) -> dict:
    sql = """SELECT category, ROUND(SUM(-amount), 2) AS total
             FROM transactions WHERE amount < 0"""
    params: list = []
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    sql += " GROUP BY category ORDER BY total DESC"
    return {"breakdown": [{"category": r[0], "total": r[1]} for r in db_query(sql, tuple(params))]}


def tool_get_monthly_breakdown(category: str | None = None) -> dict:
    sql = """SELECT strftime('%Y-%m', transaction_date), ROUND(SUM(-amount), 2)
             FROM transactions WHERE amount < 0"""
    params: list = []
    if category:
        sql += " AND category = ?"; params.append(category)
    sql += " GROUP BY 1 ORDER BY 1"
    return {"monthly": [{"month": r[0], "total": r[1]} for r in db_query(sql, tuple(params))]}


def tool_get_avg_transaction(category: str | None = None,
                             start_date: str | None = None, end_date: str | None = None) -> dict:
    sql = "SELECT ROUND(AVG(-amount), 2) FROM transactions WHERE amount < 0"
    params: list = []
    if category:
        sql += " AND category = ?"; params.append(category)
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    return {"avg": db_query(sql, tuple(params))[0][0] or 0}


def tool_get_recurring_subscriptions() -> dict:
    sql = """SELECT merchant, COUNT(*), ROUND(AVG(-amount), 2)
             FROM transactions
             WHERE amount < 0 AND is_recurring = 1 AND category = 'subscriptions'
             GROUP BY merchant ORDER BY merchant"""
    rows = db_query(sql)
    return {"subscriptions": [{"merchant": r[0], "count": r[1], "avg_amount": r[2]} for r in rows]}


def tool_get_no_spending_days(start_date: str, end_date: str) -> dict:
    sql = """WITH RECURSIVE days(d) AS (
                SELECT ?
                UNION ALL
                SELECT date(d, '+1 day') FROM days WHERE d < ?
             )
             SELECT COUNT(*) FROM days
             WHERE d NOT IN (
                SELECT DISTINCT transaction_date FROM transactions
                WHERE amount < 0 AND transaction_date BETWEEN ? AND ?
             )"""
    n = db_query(sql, (start_date, end_date, start_date, end_date))[0][0]
    return {"no_spending_days": n}


def tool_get_weekday_spending(category: str | None = None,
                              weekdays: list[int] | None = None,
                              start_date: str | None = None, end_date: str | None = None) -> dict:
    """weekdays: 0=Sunday, 6=Saturday (SQLite strftime('%w'))."""
    if not weekdays:
        weekdays = [0, 6]
    placeholders = ",".join("?" for _ in weekdays)
    sql = (f"SELECT ROUND(SUM(-amount), 2), COUNT(*) FROM transactions "
           f"WHERE amount < 0 AND CAST(strftime('%w', transaction_date) AS INTEGER) IN ({placeholders})")
    params: list = list(weekdays)
    if category:
        sql += " AND category = ?"; params.append(category)
    if start_date:
        sql += " AND transaction_date >= ?"; params.append(start_date)
    if end_date:
        sql += " AND transaction_date <= ?"; params.append(end_date)
    row = db_query(sql, tuple(params))[0]
    return {"total": row[0] or 0, "count": row[1]}


def tool_search_transactions(query: str, limit: int = 20) -> dict:
    """Пошук по description і merchant (LIKE)."""
    sql = """SELECT transaction_date, merchant, ROUND(amount, 2), category, description
             FROM transactions
             WHERE description LIKE ? OR merchant LIKE ?
             ORDER BY transaction_date LIMIT ?"""
    q = f"%{query}%"
    rows = db_query(sql, (q, q, int(limit)))
    return {"matches": [
        {"date": r[0], "merchant": r[1], "amount": r[2], "category": r[3], "description": r[4]}
        for r in rows
    ]}


TOOL_IMPLS = {
    "get_spending": tool_get_spending,
    "get_income": tool_get_income,
    "count_transactions": tool_count_transactions,
    "get_top_expenses": tool_get_top_expenses,
    "get_spending_by_category": tool_get_spending_by_category,
    "get_monthly_breakdown": tool_get_monthly_breakdown,
    "get_avg_transaction": tool_get_avg_transaction,
    "get_recurring_subscriptions": tool_get_recurring_subscriptions,
    "get_no_spending_days": tool_get_no_spending_days,
    "get_weekday_spending": tool_get_weekday_spending,
    "search_transactions": tool_search_transactions,
}


def _tool(name: str, desc: str, params: dict) -> dict:
    return {"type": "function", "function": {"name": name, "description": desc, "parameters": params}}


TOOLS_SCHEMA = [
    _tool("get_spending",
          "Сума витрат (повертає додатне число). Дати у форматі YYYY-MM-DD.",
          {"type": "object", "properties": {
              "category": {"type": "string", "description": "одна з: salary, groceries, coffee, restaurants, transport, utilities, subscriptions, fitness, shopping, health, entertainment, other_services"},
              "start_date": {"type": "string"},
              "end_date": {"type": "string"},
              "merchant": {"type": "string"},
          }}),
    _tool("get_income",
          "Сума доходів (додатних транзакцій).",
          {"type": "object", "properties": {
              "category": {"type": "string"}, "start_date": {"type": "string"}, "end_date": {"type": "string"},
          }}),
    _tool("count_transactions",
          "Кількість транзакцій з фільтрами.",
          {"type": "object", "properties": {
              "category": {"type": "string"}, "merchant": {"type": "string"},
              "start_date": {"type": "string"}, "end_date": {"type": "string"},
              "only_expenses": {"type": "boolean"},
          }}),
    _tool("get_top_expenses",
          "Топ-N найбільших витрат (сортування за сумою спадання).",
          {"type": "object", "properties": {
              "n": {"type": "integer"}, "category": {"type": "string"},
              "start_date": {"type": "string"}, "end_date": {"type": "string"},
          }, "required": ["n"]}),
    _tool("get_spending_by_category",
          "Сума витрат, згрупована по категоріях, сортування спадання.",
          {"type": "object", "properties": {
              "start_date": {"type": "string"}, "end_date": {"type": "string"},
          }}),
    _tool("get_monthly_breakdown",
          "Сума витрат по місяцях (YYYY-MM).",
          {"type": "object", "properties": {"category": {"type": "string"}}}),
    _tool("get_avg_transaction",
          "Середня сума витратної транзакції з фільтрами.",
          {"type": "object", "properties": {
              "category": {"type": "string"}, "start_date": {"type": "string"}, "end_date": {"type": "string"},
          }}),
    _tool("get_recurring_subscriptions",
          "Список регулярних підписок (is_recurring=1, category='subscriptions').",
          {"type": "object", "properties": {}}),
    _tool("get_no_spending_days",
          "Кількість днів у заданому періоді без жодної витратної транзакції.",
          {"type": "object", "properties": {
              "start_date": {"type": "string"}, "end_date": {"type": "string"},
          }, "required": ["start_date", "end_date"]}),
    _tool("get_weekday_spending",
          "Сума витрат у вказані дні тижня (0=неділя, 6=субота).",
          {"type": "object", "properties": {
              "category": {"type": "string"},
              "weekdays": {"type": "array", "items": {"type": "integer"}},
              "start_date": {"type": "string"}, "end_date": {"type": "string"},
          }}),
    _tool("search_transactions",
          "Пошук транзакцій по тексту опису або назві мерчанта.",
          {"type": "object", "properties": {
              "query": {"type": "string"}, "limit": {"type": "integer"},
          }, "required": ["query"]}),
]


SYSTEM_PROMPT_TOOL = (
    "Ти асистент особистих фінансів. Використовуй надані функції для отримання даних з БД. "
    "База містить транзакції з 2026-01-01 по 2026-04-30 (UAH). Витрати — від'ємні суми, доходи — додатні. "
    "Якщо потрібно — викликай кілька функцій. Категорії: salary, groceries, coffee, restaurants, "
    "transport, utilities, subscriptions, fitness, shopping, health, entertainment, other_services. "
    "Коли отримаєш достатньо даних, сформулюй фінальну відповідь у JSON-форматі за схемою."
)


def system_tool_use(question: str) -> tuple[dict, float, dict]:
    """Повертає (predicted, cost_usd, debug)."""
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT_TOOL},
        {"role": "user", "content": question},
    ]
    cost = 0.0
    tool_log: list[str] = []
    for _ in range(MAX_TOOL_ITER):
        r = client().chat.completions.create(
            model=CHAT_MODEL, messages=messages,
            tools=TOOLS_SCHEMA, tool_choice="auto",
        )
        cost += cost_chat(r.usage)
        msg = r.choices[0].message
        if not msg.tool_calls:
            messages.append({"role": "assistant", "content": msg.content or ""})
            break
        messages.append({
            "role": "assistant", "content": msg.content,
            "tool_calls": [tc.model_dump() for tc in msg.tool_calls],
        })
        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
                result = TOOL_IMPLS[name](**args)
            except Exception as e:
                result = {"error": str(e)}
            tool_log.append(f"{name}({json.dumps(args, ensure_ascii=False)}) -> {json.dumps(result, ensure_ascii=False, default=str)[:200]}")
            messages.append({
                "role": "tool", "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

    messages.append({"role": "user", "content": ANSWER_SCHEMA_PROMPT})
    rf = client().chat.completions.create(
        model=CHAT_MODEL, messages=messages,
        response_format={"type": "json_object"},
    )
    cost += cost_chat(rf.usage)
    predicted = parse_json(rf.choices[0].message.content)
    return predicted, cost, {"tool_calls": tool_log}


# ---------------------------------------------------------------------------
# Система 2: Text-to-SQL
# ---------------------------------------------------------------------------

def _clean_sql(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:sql)?\s*|\s*```$", "", text, flags=re.MULTILINE)
    return text.strip().rstrip(";")


def system_text_to_sql(question: str, schema: str) -> tuple[dict, float, dict]:
    cost = 0.0
    prompt = (
        f"Ти SQL-асистент. Схема SQLite:\n\n{schema}\n\n"
        "Згенеруй ОДИН SQLite-запит для питання нижче. Поверни лише SQL, без markdown і пояснень.\n"
        "Витрати — від'ємні amount, доходи — додатні. Дати у форматі 'YYYY-MM-DD'.\n"
        "Категорії: salary, groceries, coffee, restaurants, transport, utilities, subscriptions, "
        "fitness, shopping, health, entertainment, other_services.\n\n"
        f"Питання: {question}"
    )
    r1 = client().chat.completions.create(
        model=CHAT_MODEL, messages=[{"role": "user", "content": prompt}],
    )
    cost += cost_chat(r1.usage)
    sql = _clean_sql(r1.choices[0].message.content)

    try:
        rows = db_query(sql)
        result_str = json.dumps(rows[:200], ensure_ascii=False, default=str)
        sql_error = None
    except Exception as e:
        rows = []
        result_str = f"[SQL ERROR] {e}"
        sql_error = str(e)

    answer_prompt = (
        f"Питання: {question}\n\nSQL: {sql}\n\nРезультат: {result_str}\n\n"
        f"{ANSWER_SCHEMA_PROMPT}"
    )
    r2 = client().chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": answer_prompt}],
        response_format={"type": "json_object"},
    )
    cost += cost_chat(r2.usage)
    predicted = parse_json(r2.choices[0].message.content)
    return predicted, cost, {"sql": sql, "sql_error": sql_error, "row_count": len(rows)}


# ---------------------------------------------------------------------------
# Система 3: RAG
# ---------------------------------------------------------------------------

def _format_doc(t: dict) -> str:
    sign = "Дохід" if t["amount"] > 0 else "Витрата"
    rec = " (регулярна)" if t.get("is_recurring") else ""
    return (
        f"[{t['transaction_date']}] {sign} {abs(t['amount']):.2f} UAH "
        f"у '{t['merchant']}' (категорія: {t['category']}){rec}. "
        f"{t['description']}. Оплата: {t.get('payment_method', '')}."
    )


def build_or_load_rag_index(force_rebuild: bool = False) -> tuple[list[str], np.ndarray, float]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    docs = [_format_doc(t) for t in data]

    if not force_rebuild and EMB_CACHE_PATH.exists():
        z = np.load(str(EMB_CACHE_PATH), allow_pickle=True)
        cached_docs = list(z["docs"])
        if cached_docs == docs:
            embs = z["embs"]
            return docs, embs, 0.0
        print("Кеш ембедингів не співпадає, перебудовуємо.", file=sys.stderr)

    # batch embed (по 100 за раз)
    embs_list: list[np.ndarray] = []
    tokens_total = 0
    batch = 100
    for i in range(0, len(docs), batch):
        chunk = docs[i:i + batch]
        r = client().embeddings.create(model=EMB_MODEL, input=chunk)
        embs_list.append(np.array([d.embedding for d in r.data], dtype=np.float32))
        tokens_total += r.usage.prompt_tokens
    embs = np.vstack(embs_list)
    # нормалізуємо для cosine = dot product
    embs = embs / np.linalg.norm(embs, axis=1, keepdims=True).clip(min=1e-12)
    np.savez(str(EMB_CACHE_PATH), docs=np.array(docs, dtype=object), embs=embs)
    return docs, embs, cost_emb(tokens_total)


def system_rag(question: str, docs: list[str], embs: np.ndarray,
               top_k: int = RAG_TOP_K) -> tuple[dict, float, dict]:
    cost = 0.0
    r = client().embeddings.create(model=EMB_MODEL, input=[question])
    q = np.array(r.data[0].embedding, dtype=np.float32)
    q = q / (np.linalg.norm(q) + 1e-12)
    cost += cost_emb(r.usage.prompt_tokens)

    sims = embs @ q
    top_idx = np.argsort(-sims)[:top_k]
    context = "\n".join(f"{i + 1}. {docs[idx]}" for i, idx in enumerate(top_idx))

    prompt = (
        "Ти асистент особистих фінансів. Дай відповідь на питання користувача, спираючись ВИКЛЮЧНО "
        "на надані нижче транзакції (це топ-K за релевантністю — не вся БД). Якщо для точної відповіді "
        "потрібна повна агрегація по всій БД, чесно зазнач це у answer_uk. Не вигадуй транзакції.\n\n"
        f"Питання: {question}\n\n"
        f"Транзакції (топ-{top_k}):\n{context}\n\n"
        f"{ANSWER_SCHEMA_PROMPT}"
    )
    r2 = client().chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    cost += cost_chat(r2.usage)
    predicted = parse_json(r2.choices[0].message.content)
    return predicted, cost, {"top_idx": top_idx.tolist()}


# ---------------------------------------------------------------------------
# Оцінка
# ---------------------------------------------------------------------------

def _to_float(x) -> float | None:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        m = re.search(r"-?\d+[\.,]?\d*", x.replace(" ", ""))
        if m:
            return float(m.group(0).replace(",", "."))
    return None


def _close(pred: float | None, expected: float, tol_pct: float) -> bool:
    if pred is None:
        return False
    if expected == 0:
        return abs(pred) < 0.01
    return abs(pred - expected) / abs(expected) * 100 <= tol_pct


def _f1(pred_set: set, gold_set: set) -> tuple[float, float, float]:
    if not pred_set and not gold_set:
        return 1.0, 1.0, 1.0
    if not pred_set or not gold_set:
        return 0.0, 0.0, 0.0
    tp = len(pred_set & gold_set)
    p = tp / len(pred_set)
    r = tp / len(gold_set)
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f1


def evaluate(predicted: dict, expected: dict, eval_type: str, tol_pct: float = 1.0) -> dict:
    """Повертає {correct, f1, detail}."""
    detail = ""
    correct = False
    f1 = 0.0

    if eval_type == "exact_numeric":
        v = _to_float(predicted.get("numeric_value"))
        correct = _close(v, float(expected["value"]), tol_pct)
        f1 = 1.0 if correct else 0.0
        detail = f"pred={v} vs gold={expected['value']}"

    elif eval_type == "ranked_set_with_amounts":
        gold_items = expected["items"]
        gold_merch = [it["merchant"].strip().lower() for it in gold_items]
        pred_items = predicted.get("items") or []
        pred_merch = [(it.get("merchant") or "").strip().lower() for it in pred_items[:len(gold_items)]]
        gold_set = set(gold_merch); pred_set = set(pred_merch)
        p, r, f1 = _f1(pred_set, gold_set)
        # accuracy: top-1 правильний І F1 >= 0.6
        top1_ok = bool(pred_merch) and pred_merch[0] in gold_set
        correct = top1_ok and f1 >= 0.6
        detail = f"top1_ok={top1_ok} f1={f1:.2f} pred={pred_merch}"

    elif eval_type == "category_match":
        pred_cat = (predicted.get("category") or "").strip().lower()
        # також глянемо у answer_uk на випадок якщо модель не заповнила поле
        if not pred_cat:
            pred_cat = (predicted.get("answer_uk") or "").lower()
        correct = expected["category"].lower() in pred_cat
        f1 = 1.0 if correct else 0.0
        detail = f"pred_cat='{pred_cat}' gold='{expected['category']}'"

    elif eval_type == "month_match":
        pred_m = (predicted.get("month") or "").strip()
        if not pred_m:
            pred_m = predicted.get("answer_uk") or ""
        target = expected["month"]  # YYYY-MM
        month_num = target.split("-")[1]
        month_names = {
            "01": ["січ", "january"],
            "02": ["лют", "february"],
            "03": ["берез", "march"],
            "04": ["квіт", "april"],
        }
        names = month_names.get(month_num, [])
        pred_lower = pred_m.lower()
        correct = target in pred_lower or any(n in pred_lower for n in names)
        f1 = 1.0 if correct else 0.0
        detail = f"pred='{pred_m}' gold='{target}'"

    elif eval_type == "comparison_with_values":
        winner_gold = expected["winner"]
        pred_winner = (predicted.get("winner") or "").lower()
        # перевіряємо також у answer_uk
        ans = (predicted.get("answer_uk") or "").lower()
        keywords = {
            "jan": ["jan", "січен", "січн"],
            "feb": ["feb", "лют"],
            "apr": ["apr", "квіт"],
            "coffee_avg": ["coffee", "кав"],
            "rest_avg": ["rest", "ресторан"],
        }
        wkw = keywords.get(winner_gold, [winner_gold.lower()])
        correct = any(k in pred_winner for k in wkw) or any(k in ans for k in wkw)
        # F1 на значеннях
        vals = predicted.get("values") or {}
        f1_parts = []
        for key in (k for k in expected.keys() if isinstance(expected[k], (int, float)) and k not in {"diff"}):
            pv = _to_float(vals.get(key))
            f1_parts.append(1.0 if _close(pv, float(expected[key]), 2.0) else 0.0)
        f1 = statistics.mean(f1_parts) if f1_parts else (1.0 if correct else 0.0)
        detail = f"winner_pred='{pred_winner}' gold='{winner_gold}' vals={vals}"

    elif eval_type == "merchant_set":
        gold = {m.strip().lower() for m in expected["merchants"]}
        pred_list = predicted.get("merchants") or []
        # також з items
        if not pred_list and predicted.get("items"):
            pred_list = [it.get("merchant") for it in predicted["items"] if it.get("merchant")]
        pred = {(m or "").strip().lower() for m in pred_list}
        p, r, f1 = _f1(pred, gold)
        correct = f1 >= 0.7
        detail = f"f1={f1:.2f} p={p:.2f} r={r:.2f} pred={sorted(pred)}"

    elif eval_type == "ratio_with_values":
        vals = predicted.get("values") or {}
        ess = _to_float(vals.get("essential"))
        disc = _to_float(vals.get("discretionary"))
        ok_ess = _close(ess, float(expected["essential"]), 2.0)
        ok_disc = _close(disc, float(expected["discretionary"]), 2.0)
        # альтернатива: перевірка essential_share_pct
        share = _to_float(vals.get("essential_share_pct")) or _to_float(predicted.get("numeric_value"))
        ok_share = _close(share, float(expected["essential_share_pct"]), 3.0)
        correct = (ok_ess and ok_disc) or ok_share
        f1 = sum([ok_ess, ok_disc, ok_share]) / 3.0
        detail = f"ess={ess} disc={disc} share={share}"

    elif eval_type == "percentage_with_direction":
        pred_pct = _to_float(predicted.get("pct_change")) or _to_float(predicted.get("numeric_value"))
        ok_pct = _close(pred_pct, float(expected["pct_change"]), tol_pct)
        pred_dir = (predicted.get("direction") or "").lower()
        ans = (predicted.get("answer_uk") or "").lower()
        dir_keywords = {"increase": ["increase", "збільш", "зріс", "виріс", "більше"],
                        "decrease": ["decrease", "зменш", "впал", "менше"]}
        ok_dir = any(k in pred_dir for k in dir_keywords[expected["direction"]]) or \
                 any(k in ans for k in dir_keywords[expected["direction"]])
        correct = ok_pct and ok_dir
        f1 = (int(ok_pct) + int(ok_dir)) / 2.0
        detail = f"pct={pred_pct} dir='{pred_dir}'"

    elif eval_type == "expect_zero_or_disclaimer":
        v = _to_float(predicted.get("numeric_value"))
        text = (predicted.get("answer_uk") or "").lower()
        valid = expected.get("valid_responses", [])
        zero_ok = (v == 0 or v is None)
        text_ok = any(vr.lower() in text for vr in valid)
        correct = zero_ok or text_ok
        f1 = 1.0 if correct else 0.0
        detail = f"v={v} text='{text[:80]}'"

    else:
        detail = f"unknown eval_type: {eval_type}"

    return {"correct": bool(correct), "f1": float(f1), "detail": detail}


# ---------------------------------------------------------------------------
# Прогін
# ---------------------------------------------------------------------------

def run(systems: list[str], repeats: int, limit: int | None) -> None:
    if not os.environ.get("OPENAI_API_KEY"):
        print("ПОМИЛКА: OPENAI_API_KEY не встановлений", file=sys.stderr)
        sys.exit(1)

    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    questions = golden["questions"]
    if limit:
        questions = questions[:limit]

    # RAG: збудувати або завантажити індекс
    docs: list[str] = []
    embs: np.ndarray = np.empty(0)
    rag_setup_cost = 0.0
    if "rag" in systems:
        print("Будуємо/завантажуємо RAG індекс...", file=sys.stderr)
        docs, embs, rag_setup_cost = build_or_load_rag_index()
        print(f"  {len(docs)} документів, setup cost ${rag_setup_cost:.5f}", file=sys.stderr)

    rows: list[dict] = []
    total_questions = len(questions)
    total_calls = total_questions * len(systems) * repeats
    done = 0

    for q in questions:
        qid = q["id"]
        question_text = q["question_uk"]
        eval_type = q["evaluation"]
        tol = float(q.get("tolerance_pct", 1.0))
        expected = q["expected"]

        for sys_name in systems:
            for rep in range(repeats):
                done += 1
                t0 = time.perf_counter()
                try:
                    if sys_name == "tool_use":
                        pred, cost, dbg = system_tool_use(question_text)
                    elif sys_name == "text_to_sql":
                        pred, cost, dbg = system_text_to_sql(question_text, schema)
                    elif sys_name == "rag":
                        pred, cost, dbg = system_rag(question_text, docs, embs)
                    else:
                        raise ValueError(sys_name)
                    error = None
                except Exception as e:
                    pred, cost, dbg = {}, 0.0, {}
                    error = repr(e)
                latency = time.perf_counter() - t0

                ev = evaluate(pred, expected, eval_type, tol) if not error else \
                     {"correct": False, "f1": 0.0, "detail": f"error: {error}"}

                row = {
                    "qid": qid, "system": sys_name, "repeat": rep,
                    "question": question_text, "eval_type": eval_type,
                    "correct": ev["correct"], "f1": ev["f1"],
                    "latency_s": round(latency, 3), "cost_usd": cost,
                    "predicted": pred, "expected": expected,
                    "detail": ev["detail"], "debug": dbg, "error": error,
                }
                rows.append(row)
                status = "✓" if ev["correct"] else "✗"
                print(f"[{done}/{total_calls}] q{qid:02d} {sys_name:11s} rep{rep} "
                      f"{status} f1={ev['f1']:.2f} t={latency:.1f}s ${cost:.4f}  {ev['detail'][:80]}",
                      file=sys.stderr)

    # ---- агрегація ----
    out_dir = ROOT
    (out_dir / "results.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    # csv
    import csv
    with open(out_dir / "results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["qid", "system", "repeat", "correct", "f1", "latency_s", "cost_usd", "detail", "error"])
        for r in rows:
            w.writerow([r["qid"], r["system"], r["repeat"], int(r["correct"]),
                        f"{r['f1']:.3f}", r["latency_s"], f"{r['cost_usd']:.6f}",
                        r["detail"][:200], r["error"] or ""])

    # metrics per system
    summary: dict[str, dict] = {}
    for sys_name in systems:
        subset = [r for r in rows if r["system"] == sys_name]
        # accuracy: для повторів беремо більшість (correct >= ceil(reps/2))
        per_q_correct: list[float] = []
        per_q_f1: list[float] = []
        for q in questions:
            qrows = [r for r in subset if r["qid"] == q["id"]]
            if not qrows:
                continue
            corr_share = sum(1 for r in qrows if r["correct"]) / len(qrows)
            per_q_correct.append(1.0 if corr_share >= 0.5 else 0.0)
            per_q_f1.append(statistics.mean(r["f1"] for r in qrows))
        latencies = [r["latency_s"] for r in subset]
        costs = [r["cost_usd"] for r in subset]
        summary[sys_name] = {
            "accuracy_pct": round(100 * statistics.mean(per_q_correct), 1) if per_q_correct else 0,
            "f1_mean": round(statistics.mean(per_q_f1), 3) if per_q_f1 else 0,
            "latency_p50_s": round(statistics.median(latencies), 2) if latencies else 0,
            "latency_p95_s": round(sorted(latencies)[int(0.95 * (len(latencies) - 1))], 2) if latencies else 0,
            "cost_per_100": round(100 * statistics.mean(costs), 3) if costs else 0,
            "n_calls": len(subset),
            "total_cost_usd": round(sum(costs), 4),
        }

    # markdown table
    md = ["# Результати benchmark", "",
          f"- Питань: {total_questions}",
          f"- Повторів: {repeats}",
          f"- Модель: `{CHAT_MODEL}`",
          f"- Embeddings: `{EMB_MODEL}` (setup ${rag_setup_cost:.4f})",
          "",
          "| Метрика | tool-use | RAG | text-to-SQL |",
          "|---|---|---|---|"]

    def cell(name: str, key: str, suffix: str = "") -> str:
        vals = [summary.get(s, {}).get(key, "—") for s in ["tool_use", "rag", "text_to_sql"]]
        return f"| {name} | " + " | ".join(f"{v}{suffix}" for v in vals) + " |"

    md.append(cell("Accuracy (%)", "accuracy_pct", "%"))
    md.append(cell("Completeness (F1)", "f1_mean"))
    md.append(cell("Latency p50 (s)", "latency_p50_s"))
    md.append(cell("Latency p95 (s)", "latency_p95_s"))
    md.append(cell("Cost / 100 запитів ($)", "cost_per_100"))
    md.append(cell("Total cost ($)", "total_cost_usd"))
    md.append(cell("N calls", "n_calls"))

    md_text = "\n".join(md)
    (out_dir / "metrics.md").write_text(md_text + "\n", encoding="utf-8")

    # summary.csv — один рядок на систему, готовий до імпорту в Sheets
    with open(out_dir / "summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["system", "accuracy_pct", "f1_mean",
                    "latency_p50_s", "latency_p95_s",
                    "cost_per_100_usd", "total_cost_usd", "n_calls"])
        for sys_name in systems:
            s = summary[sys_name]
            w.writerow([sys_name, s["accuracy_pct"], s["f1_mean"],
                        s["latency_p50_s"], s["latency_p95_s"],
                        s["cost_per_100"], s["total_cost_usd"], s["n_calls"]])

    # per_question.csv — один рядок на питання, всі системи в широкому форматі
    def _short_expected(exp: dict) -> str:
        for k in ("value", "category", "month", "winner"):
            if k in exp:
                return f"{k}={exp[k]}"
        if "items" in exp:
            return "items=" + ", ".join(it["merchant"] for it in exp["items"])
        if "merchants" in exp:
            return "merchants=" + ", ".join(exp["merchants"])
        return json.dumps(exp, ensure_ascii=False, default=str)[:120]

    def _short_pred(pred: dict, eval_type: str) -> str:
        if eval_type == "exact_numeric" or eval_type == "expect_zero_or_disclaimer":
            return str(pred.get("numeric_value"))
        if eval_type == "category_match":
            return str(pred.get("category") or pred.get("answer_uk", ""))[:80]
        if eval_type == "month_match":
            return str(pred.get("month") or pred.get("answer_uk", ""))[:80]
        if eval_type in ("ranked_set_with_amounts",):
            its = pred.get("items") or []
            return ", ".join((it.get("merchant") or "?") for it in its[:5])
        if eval_type == "merchant_set":
            ms = pred.get("merchants") or [
                it.get("merchant") for it in (pred.get("items") or []) if it.get("merchant")
            ]
            return ", ".join(ms)
        if eval_type == "comparison_with_values":
            return f"winner={pred.get('winner')} values={pred.get('values')}"
        if eval_type == "ratio_with_values":
            return str(pred.get("values"))
        if eval_type == "percentage_with_direction":
            return f"pct={pred.get('pct_change')} dir={pred.get('direction')}"
        return (pred.get("answer_uk") or "")[:120]

    with open(out_dir / "per_question.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        header = ["qid", "difficulty", "eval_type", "question", "expected"]
        for s in systems:
            header += [f"{s}_pred", f"{s}_correct", f"{s}_f1",
                       f"{s}_latency_s", f"{s}_cost_usd"]
        w.writerow(header)

        for q in questions:
            row = [q["id"], q["difficulty"], q["evaluation"],
                   q["question_uk"], _short_expected(q["expected"])]
            for s in systems:
                qrows = [r for r in rows if r["qid"] == q["id"] and r["system"] == s]
                if not qrows:
                    row += ["", "", "", "", ""]
                    continue
                # використовуємо перший repeat для prediction (репрезентативний)
                first = qrows[0]
                # за метриками — усереднюємо по повторах
                corr_share = sum(1 for r in qrows if r["correct"]) / len(qrows)
                row += [
                    _short_pred(first["predicted"], q["evaluation"]),
                    int(corr_share >= 0.5),
                    round(statistics.mean(r["f1"] for r in qrows), 3),
                    round(statistics.median(r["latency_s"] for r in qrows), 2),
                    round(statistics.mean(r["cost_usd"] for r in qrows), 5),
                ]
            w.writerow(row)

    print("\n" + md_text)
    print(f"\nЗбережено у {out_dir}:")
    print("  metrics.md         — фінальна таблиця 4 метрик × 3 систем")
    print("  summary.csv        — те саме у CSV (1 рядок на систему)")
    print("  per_question.csv   — широкий формат: питання × системи з prediction")
    print("  results.csv        — довгий формат: 1 рядок на кожен виклик")
    print("  results.json       — повний debug (sql, tool_calls, top-K)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--systems", type=str, default="tool_use,text_to_sql,rag",
                    help="кома-розділені: tool_use,text_to_sql,rag")
    ap.add_argument("--limit", type=int, default=None,
                    help="обмежити кількість питань (для швидкого smoke-тесту)")
    args = ap.parse_args()

    systems = [s.strip() for s in args.systems.split(",") if s.strip()]
    run(systems, args.repeats, args.limit)


if __name__ == "__main__":
    main()
