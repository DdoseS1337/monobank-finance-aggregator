"""
Генератор синтетичного датасету персональних фінансових транзакцій.

Період: 01.01.2026 - 30.04.2026 (4 місяці).
Валюта: UAH.
Структура: одна таблиця transactions з усіма транзакціями (income + expenses).

Вихід:
  - transactions.json - сирі дані для RAG / інспекції
  - transactions.db - готова SQLite БД для text-to-SQL і tool-use
  - schema.sql - dump схеми для системного промпта text-to-SQL

random.seed(42) фіксований для повної відтворюваності.
"""
import json
import random
import sqlite3
from datetime import date, timedelta
from calendar import monthrange

random.seed(42)

# ---------------------------------------------------------------------------
# Конфігурація: мерчанти, категорії, амплітуди сум
# ---------------------------------------------------------------------------

MERCHANTS = {
    "groceries": ["АТБ", "Сільпо", "Novus", "METRO", "Varus", "Auchan", "Фора"],
    "restaurants": ["McDonald's", "KFC", "Puzata Hata", "Mafia", "Pesto Cafe",
                    "Львівські круасани", "Сушия", "Bila Akula"],
    "coffee": ["Aroma Kava", "One Love Espresso Bar", "Bulka", "Coffeelat", "Mr.Bublik"],
    "transport": ["Uklon", "Uber", "Київський метрополітен", "Київпасстранс", "Bolt"],
    "utilities": ["Yasno (електроенергія)", "Київгаз", "Київводоканал",
                  "Київтеплоенерго", "ОСББ"],
    "health": ["Аптека Подорожник", "Аптека АНЦ", "Medicover", "Стоматологія Білий"],
    "shopping": ["Rozetka", "OLX", "Zara", "H&M", "Foxtrot", "Citrus", "MOYO"],
    "entertainment": ["Multiplex", "Планета Кіно", "Concert.ua", "Karabas", "Bel Etage"],
    "internet_provider": ["Київстар Інтернет"],
    "fitness": ["SportLife"],
    "other_services": ["Нова Пошта", "Укрпошта"],
}

PAYMENT_METHODS = ["Visa ПриватБанк", "Mastercard monobank", "Apple Pay monobank",
                   "Google Pay ПриватБанк", "Готівка"]

# Рекурентні підписки: (merchant, category, amount, day_of_month, description_template)
RECURRING = [
    ("Netflix", "subscriptions", 299.00, 1, "Передплата Netflix Standard план"),
    ("Spotify", "subscriptions", 134.00, 5, "Spotify Premium місячна підписка"),
    ("Megogo", "subscriptions", 99.00, 10, "Megogo підписка стандарт"),
    ("Apple iCloud", "subscriptions", 99.00, 15, "Apple iCloud 200GB сховище"),
    ("Notion Labs", "subscriptions", 392.00, 8, "Notion Plus підписка"),
    ("Київстар Інтернет", "utilities", 250.00, 1, "Домашній інтернет Київстар"),
    ("SportLife", "fitness", 700.00, 3, "Абонемент у спортивний клуб SportLife"),
]

# Зарплата
SALARY_EMPLOYER = "ТОВ Геткамп"
SALARY_AMOUNT_FIRST = 20000.00   # аванс 15-го
SALARY_AMOUNT_SECOND = 45000.00  # основна частина в кінці місяця


# ---------------------------------------------------------------------------
# Генерація транзакцій
# ---------------------------------------------------------------------------

def daterange(start, end):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def gen_amount(min_v, max_v, decimals=2):
    """Генерує суму в межах [min_v, max_v] з округленням."""
    return round(random.uniform(min_v, max_v), decimals)


def month_name_uk(m):
    months = ["", "січень", "лютий", "березень", "квітень", "травень", "червень",
              "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"]
    return months[m]


def generate_transactions(start_date, end_date):
    transactions = []
    tx_id = 1

    # 1. Зарплата: 15-го (аванс) та останній робочий день місяця (основна)
    cur = start_date.replace(day=1)
    while cur <= end_date:
        first_pay = cur.replace(day=15)
        if start_date <= first_pay <= end_date:
            transactions.append({
                "id": tx_id,
                "transaction_date": first_pay.isoformat(),
                "amount": SALARY_AMOUNT_FIRST,
                "currency": "UAH",
                "merchant": SALARY_EMPLOYER,
                "category": "salary",
                "subcategory": "advance",
                "payment_method": "bank_transfer",
                "description": f"Аванс заробітної плати за {month_name_uk(first_pay.month)} {first_pay.year}",
                "is_recurring": True,
            })
            tx_id += 1

        last_day_num = monthrange(cur.year, cur.month)[1]
        last_pay = cur.replace(day=last_day_num)
        if start_date <= last_pay <= end_date:
            transactions.append({
                "id": tx_id,
                "transaction_date": last_pay.isoformat(),
                "amount": SALARY_AMOUNT_SECOND,
                "currency": "UAH",
                "merchant": SALARY_EMPLOYER,
                "category": "salary",
                "subcategory": "main",
                "payment_method": "bank_transfer",
                "description": f"Основна частина заробітної плати за {month_name_uk(last_pay.month)} {last_pay.year}",
                "is_recurring": True,
            })
            tx_id += 1

        # перейти на наступний місяць
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)

    # 2. Рекурентні підписки
    cur = start_date.replace(day=1)
    while cur <= end_date:
        for merchant, category, amount, day, desc_tmpl in RECURRING:
            try:
                tx_date = cur.replace(day=day)
            except ValueError:
                continue
            if start_date <= tx_date <= end_date:
                # невелика варіація суми ±2% для реалізму (інакше «занадто чисто» виглядає)
                amt = round(amount * random.uniform(0.99, 1.01), 2)
                transactions.append({
                    "id": tx_id,
                    "transaction_date": tx_date.isoformat(),
                    "amount": -amt,  # витрата
                    "currency": "UAH",
                    "merchant": merchant,
                    "category": category,
                    "subcategory": "monthly_subscription",
                    "payment_method": random.choice(["Visa ПриватБанк", "Mastercard monobank"]),
                    "description": f"{desc_tmpl}, {month_name_uk(tx_date.month)} {tx_date.year}",
                    "is_recurring": True,
                })
                tx_id += 1

        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)

    # 3. Комуналка: один раз на місяць, високо взимку, нижче навесні
    cur = start_date.replace(day=1)
    while cur <= end_date:
        pay_day = random.randint(8, 20)
        try:
            tx_date = cur.replace(day=pay_day)
        except ValueError:
            tx_date = cur.replace(day=15)
        if start_date <= tx_date <= end_date:
            # Газ + електрика + вода + опалення
            for provider, (min_v, max_v) in [
                ("Yasno (електроенергія)", (350, 900)),
                ("Київгаз", (200, 800) if cur.month in (1, 2, 3) else (50, 200)),
                ("Київводоканал", (180, 320)),
                ("Київтеплоенерго", (1800, 3500) if cur.month in (1, 2, 3) else (400, 1200)),
                ("ОСББ", (600, 950)),
            ]:
                amt = gen_amount(min_v, max_v)
                transactions.append({
                    "id": tx_id,
                    "transaction_date": tx_date.isoformat(),
                    "amount": -amt,
                    "currency": "UAH",
                    "merchant": provider,
                    "category": "utilities",
                    "subcategory": None,
                    "payment_method": "monobank Apple Pay",
                    "description": f"Оплата комунальних послуг {provider.split(' ')[0]} за {month_name_uk(cur.month)} {cur.year}",
                    "is_recurring": True,
                })
                tx_id += 1

        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)

    # 4. Варіативні витрати: щодня з певною ймовірністю
    DAILY_PROBS = {
        "groceries": 0.35,
        "coffee": 0.40,
        "restaurants": 0.20,
        "transport": 0.55,
        "shopping": 0.06,
        "health": 0.05,
        "entertainment": 0.07,
        "other_services": 0.06,
    }

    AMOUNT_RANGES = {
        "groceries": (150, 1400),
        "coffee": (65, 220),
        "restaurants": (220, 1100),
        "transport": (30, 280),
        "shopping": (300, 3500),
        "health": (90, 1800),
        "entertainment": (180, 1500),
        "other_services": (60, 380),
    }

    DESC_TEMPLATES = {
        "groceries": [
            "Покупка продуктів у {merchant}",
            "Тижневі продукти {merchant}, район Печерськ",
            "Швидка покупка в {merchant} по дорозі додому",
            "Закупка на тиждень {merchant}",
        ],
        "coffee": [
            "Ранкова кава {merchant}",
            "Кава з колегами {merchant}",
            "Кава на виніс {merchant}",
            "Капучино і круасан {merchant}",
        ],
        "restaurants": [
            "Обід у {merchant}",
            "Вечеря з друзями {merchant}",
            "Бізнес-ланч {merchant}",
            "Замовлення доставки {merchant}",
            "Сімейна вечеря {merchant}",
        ],
        "transport": [
            "Поїздка таксі {merchant}",
            "Поїздка {merchant} додому",
            "Поїздка {merchant} на роботу",
            "Поповнення метро {merchant}",
            "Проїзд {merchant}",
        ],
        "shopping": [
            "Покупка техніки в {merchant}",
            "Замовлення {merchant}, доставка Нова Пошта",
            "Одяг {merchant}",
            "Побутова техніка {merchant}",
            "Аксесуари {merchant}",
        ],
        "health": [
            "Покупка ліків {merchant}",
            "Візит лікаря {merchant}",
            "Аптечні товари {merchant}",
            "Профілактичний огляд {merchant}",
        ],
        "entertainment": [
            "Квитки в кіно {merchant}",
            "Концерт {merchant}",
            "Вечір у барі {merchant}",
            "Розваги вихідного дня {merchant}",
        ],
        "other_services": [
            "Відправлення посилки {merchant}",
            "Отримання посилки {merchant}",
            "Доставка {merchant}",
        ],
    }

    for d in daterange(start_date, end_date):
        # вихідні: більше ресторанів і розваг, менше транспорту
        is_weekend = d.weekday() >= 5
        for category, prob in DAILY_PROBS.items():
            p = prob
            if is_weekend:
                if category in ("restaurants", "entertainment", "shopping"):
                    p *= 1.5
                if category == "transport":
                    p *= 0.5

            # скільки разів за день (максимум — щоб уникати викидів)
            max_per_day = 2 if category in ("groceries", "coffee", "transport") else 1
            n = 0
            while random.random() < p and n < max_per_day:
                n += 1
                p *= 0.4  # після першого спрацювання різко знижуємо

            for _ in range(n):
                merchant = random.choice(MERCHANTS[category])
                lo, hi = AMOUNT_RANGES[category]
                amt = gen_amount(lo, hi)
                desc = random.choice(DESC_TEMPLATES[category]).format(merchant=merchant)
                transactions.append({
                    "id": tx_id,
                    "transaction_date": d.isoformat(),
                    "amount": -amt,
                    "currency": "UAH",
                    "merchant": merchant,
                    "category": category,
                    "subcategory": None,
                    "payment_method": random.choice(PAYMENT_METHODS),
                    "description": desc,
                    "is_recurring": False,
                })
                tx_id += 1

    # 5. Кілька викидів — навмисно великих покупок, для топ-N і виявлення аномалій
    outliers = [
        (date(2026, 2, 14), "Concert.ua", "entertainment", 4500, "Квитки на концерт Океан Ельзи у Палаці Україна"),
        (date(2026, 3, 8),  "Rozetka",    "shopping",     18900, "Покупка ноутбука MacBook Air M3 для роботи"),
        (date(2026, 1, 25), "Foxtrot",    "shopping",      8200, "Заміна холодильника на новий Samsung"),
        (date(2026, 4, 12), "Bel Etage",  "entertainment", 3200, "Театральні квитки на двох, прем'єра"),
        (date(2026, 4, 22), "Medicover",  "health",        4800, "Комплексний медогляд щорічний"),
    ]
    for d, merchant, category, amt, desc in outliers:
        if start_date <= d <= end_date:
            transactions.append({
                "id": tx_id,
                "transaction_date": d.isoformat(),
                "amount": -float(amt),
                "currency": "UAH",
                "merchant": merchant,
                "category": category,
                "subcategory": "large_purchase",
                "payment_method": "Visa ПриватБанк",
                "description": desc,
                "is_recurring": False,
            })
            tx_id += 1

    # Сортуємо за датою + id для зручності
    transactions.sort(key=lambda t: (t["transaction_date"], t["id"]))
    # Перепризначимо id послідовно після сортування
    for i, t in enumerate(transactions, start=1):
        t["id"] = i

    return transactions


# ---------------------------------------------------------------------------
# Запис у JSON та SQLite
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    transaction_date TEXT NOT NULL,          -- ISO format YYYY-MM-DD
    amount REAL NOT NULL,                    -- negative = expense, positive = income (UAH)
    currency TEXT NOT NULL DEFAULT 'UAH',
    merchant TEXT NOT NULL,                  -- e.g. 'АТБ', 'Netflix'
    category TEXT NOT NULL,                  -- 'groceries', 'salary', 'subscriptions', ...
    subcategory TEXT,                        -- nullable, e.g. 'monthly_subscription'
    payment_method TEXT,                     -- 'Visa ПриватБанк', 'Готівка', ...
    description TEXT NOT NULL,               -- natural-language description (useful for RAG)
    is_recurring INTEGER NOT NULL DEFAULT 0  -- 0 or 1 (SQLite has no native bool)
);

CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(merchant);
"""


def write_sqlite(transactions, db_path):
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.executemany(
            """INSERT INTO transactions
               (id, transaction_date, amount, currency, merchant, category,
                subcategory, payment_method, description, is_recurring)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (t["id"], t["transaction_date"], t["amount"], t["currency"],
                 t["merchant"], t["category"], t["subcategory"],
                 t["payment_method"], t["description"], int(t["is_recurring"]))
                for t in transactions
            ]
        )
        conn.commit()
    finally:
        conn.close()


def write_json(transactions, json_path):
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(transactions, f, ensure_ascii=False, indent=2)


def write_schema(sql_path):
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write(SCHEMA_SQL.strip() + "\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os, sys

    START = date(2026, 1, 1)
    END = date(2026, 4, 30)

    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    txs = generate_transactions(START, END)

    write_json(txs, os.path.join(out_dir, "transactions.json"))

    db_path = os.path.join(out_dir, "transactions.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    write_sqlite(txs, db_path)

    write_schema(os.path.join(out_dir, "schema.sql"))

    # Короткий звіт
    income = sum(t["amount"] for t in txs if t["amount"] > 0)
    expense = sum(t["amount"] for t in txs if t["amount"] < 0)
    print(f"Згенеровано транзакцій: {len(txs)}")
    print(f"Період: {START.isoformat()} – {END.isoformat()}")
    print(f"Загальний дохід:  {income:>12,.2f} UAH")
    print(f"Загальні витрати: {expense:>12,.2f} UAH")
    print(f"Баланс:           {income + expense:>12,.2f} UAH")
    print(f"Файли збережено в: {out_dir}")
