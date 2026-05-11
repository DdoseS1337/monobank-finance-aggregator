"""
Генератор Golden Dataset для оцінки tool-use vs RAG vs text-to-SQL.

20 питань різної складності + правильні відповіді, обчислені SQL'ем
над transactions.db. Зберігається в golden_dataset.json для подальшої
автоматичної оцінки систем.

Структура кожного питання:
  id              - порядковий номер
  question_uk     - питання українською (те, що подається моделі)
  difficulty      - 'easy' | 'medium' | 'hard' | 'trap'
  query_type      - тип запиту (single_agg, top_n, recurring_detection, ...)
  reference_sql   - канонічний SQL для отримання еталонної відповіді
  expected        - обчислена правильна відповідь
  evaluation      - як оцінювати (exact_numeric, numeric_set, string_set, ...)
  tolerance       - допустима похибка для numeric відповідей
  notes           - очікувані виклики для кожної архітектури
"""
import json
import sqlite3
from decimal import Decimal


QUESTIONS = [
    # ---------- EASY: проста агрегація / фільтр ----------
    {
        "id": 1,
        "question_uk": "Скільки я витратив на каву в березні 2026 року?",
        "difficulty": "easy",
        "query_type": "single_aggregation",
        "reference_sql": """
            SELECT ROUND(SUM(-amount), 2) AS total
            FROM transactions
            WHERE category='coffee' AND amount<0
              AND transaction_date BETWEEN '2026-03-01' AND '2026-03-31'
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "easy — функція get_spending(category, period)",
            "text_to_sql": "easy — стандартна SUM + WHERE",
            "rag": "fail — потребує точної агрегації; LLM спробує підсумувати top-k результатів і помилиться"
        }
    },
    {
        "id": 2,
        "question_uk": "Скільки разів я робив покупки в АТБ за весь період?",
        "difficulty": "easy",
        "query_type": "single_count",
        "reference_sql": """
            SELECT COUNT(*) AS n
            FROM transactions
            WHERE merchant='АТБ' AND amount<0
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 0,
        "notes": {
            "tool_use": "easy — count_transactions(merchant)",
            "text_to_sql": "easy — COUNT(*) WHERE",
            "rag": "fail — RAG поверне приклади, але точний COUNT над усіма даними дати не зможе"
        }
    },
    {
        "id": 3,
        "question_uk": "Яка моя загальна сума витрат за квітень 2026?",
        "difficulty": "easy",
        "query_type": "single_aggregation",
        "reference_sql": """
            SELECT ROUND(SUM(-amount), 2) AS total
            FROM transactions
            WHERE amount<0
              AND transaction_date BETWEEN '2026-04-01' AND '2026-04-30'
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "easy",
            "text_to_sql": "easy",
            "rag": "fail — повна агрегація неможлива через top-k обмеження"
        }
    },
    {
        "id": 4,
        "question_uk": "Скільки я отримав зарплати за весь період?",
        "difficulty": "easy",
        "query_type": "single_aggregation_income",
        "reference_sql": """
            SELECT ROUND(SUM(amount), 2) AS total
            FROM transactions
            WHERE category='salary' AND amount>0
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 0,
        "notes": {
            "tool_use": "easy",
            "text_to_sql": "easy",
            "rag": "медіум — лише 8 транзакцій зарплати, всі можуть потрапити в top-k"
        }
    },
    {
        "id": 5,
        "question_uk": "Скільки разів я платив за Netflix?",
        "difficulty": "easy",
        "query_type": "single_count",
        "reference_sql": """
            SELECT COUNT(*) AS n
            FROM transactions
            WHERE merchant='Netflix'
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 0,
        "notes": {
            "tool_use": "easy",
            "text_to_sql": "easy",
            "rag": "easy — лише 4 транзакції, всі знайдуться семантично"
        }
    },

    # ---------- MEDIUM: множинні умови, групування, порівняння ----------
    {
        "id": 6,
        "question_uk": "Назви мої 5 найбільших витрат за весь період і вкажи на що вони були.",
        "difficulty": "medium",
        "query_type": "top_n_with_context",
        "reference_sql": """
            SELECT transaction_date, merchant, -amount AS amt, description
            FROM transactions
            WHERE amount<0
            ORDER BY amount ASC LIMIT 5
        """,
        "evaluation": "ranked_set_with_amounts",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "easy — get_top_expenses(n=5)",
            "text_to_sql": "easy — ORDER BY ASC LIMIT 5",
            "rag": "medium — викиди мають великі суми в описах, semantic match може спрацювати"
        }
    },
    {
        "id": 7,
        "question_uk": "На яку категорію витрат я витрачаю найбільше грошей?",
        "difficulty": "medium",
        "query_type": "group_by_max",
        "reference_sql": """
            SELECT category, ROUND(SUM(-amount), 2) AS total
            FROM transactions
            WHERE amount<0
            GROUP BY category
            ORDER BY total DESC LIMIT 1
        """,
        "evaluation": "category_match",
        "notes": {
            "tool_use": "easy — get_spending_by_category()",
            "text_to_sql": "easy — GROUP BY ORDER BY LIMIT 1",
            "rag": "fail — потребує агрегації по всіх категоріях"
        }
    },
    {
        "id": 8,
        "question_uk": "В якому місяці я витратив найбільше на ресторани?",
        "difficulty": "medium",
        "query_type": "group_by_time_max",
        "reference_sql": """
            SELECT strftime('%Y-%m', transaction_date) AS month,
                   ROUND(SUM(-amount), 2) AS total
            FROM transactions
            WHERE category='restaurants' AND amount<0
            GROUP BY month
            ORDER BY total DESC LIMIT 1
        """,
        "evaluation": "month_match",
        "notes": {
            "tool_use": "easy — get_monthly_breakdown(category)",
            "text_to_sql": "medium — strftime, GROUP BY month",
            "rag": "fail — потребує time-based aggregation"
        }
    },
    {
        "id": 9,
        "question_uk": "Який мій середній чек у ресторанах?",
        "difficulty": "medium",
        "query_type": "single_avg",
        "reference_sql": """
            SELECT ROUND(AVG(-amount), 2) AS avg_check
            FROM transactions
            WHERE category='restaurants' AND amount<0
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "easy",
            "text_to_sql": "easy",
            "rag": "fail — AVG неможливо без повних даних"
        }
    },
    {
        "id": 10,
        "question_uk": "Я витратив більше на продукти в січні чи в лютому?",
        "difficulty": "medium",
        "query_type": "period_comparison",
        "reference_sql": """
            SELECT
                ROUND(SUM(CASE WHEN strftime('%Y-%m', transaction_date)='2026-01' THEN -amount ELSE 0 END), 2) AS jan,
                ROUND(SUM(CASE WHEN strftime('%Y-%m', transaction_date)='2026-02' THEN -amount ELSE 0 END), 2) AS feb
            FROM transactions
            WHERE category='groceries' AND amount<0
        """,
        "evaluation": "comparison_with_values",
        "notes": {
            "tool_use": "easy — два виклики get_spending() + порівняння",
            "text_to_sql": "medium — CASE або два запити",
            "rag": "fail — порівняння двох періодів"
        }
    },
    {
        "id": 11,
        "question_uk": "Скільки я витратив на комунальні послуги взимку (січень + лютий 2026)?",
        "difficulty": "medium",
        "query_type": "multi_period_aggregation",
        "reference_sql": """
            SELECT ROUND(SUM(-amount), 2) AS total
            FROM transactions
            WHERE category='utilities' AND amount<0
              AND transaction_date BETWEEN '2026-01-01' AND '2026-02-28'
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "easy",
            "text_to_sql": "easy",
            "rag": "fail — потрібна повна агрегація"
        }
    },
    {
        "id": 12,
        "question_uk": "Які мої найдорожчі покупки в категорії shopping (топ-3)?",
        "difficulty": "medium",
        "query_type": "filtered_top_n",
        "reference_sql": """
            SELECT transaction_date, merchant, -amount AS amt, description
            FROM transactions
            WHERE category='shopping' AND amount<0
            ORDER BY amount ASC LIMIT 3
        """,
        "evaluation": "ranked_set_with_amounts",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "easy",
            "text_to_sql": "easy",
            "rag": "medium — викиди можуть знайтись семантично"
        }
    },

    # ---------- HARD: pattern detection, складна логіка ----------
    {
        "id": 13,
        "question_uk": "Які підписки я плачу регулярно щомісяця?",
        "difficulty": "hard",
        "query_type": "recurring_detection",
        "reference_sql": """
            SELECT merchant, COUNT(*) AS n, ROUND(AVG(-amount), 2) AS avg_amt
            FROM transactions
            WHERE amount<0 AND is_recurring=1 AND category='subscriptions'
            GROUP BY merchant
            ORDER BY merchant
        """,
        "evaluation": "merchant_set",
        "notes": {
            "tool_use": "medium — потребує функції detect_recurring() або готового pattern matcher",
            "text_to_sql": "medium-hard — GROUP BY HAVING COUNT >= 3, або фільтр по is_recurring (якщо модель здогадається використати флаг)",
            "rag": "fail — pattern detection поза можливостями RAG"
        }
    },
    {
        "id": 14,
        "question_uk": "Скільки днів у квітні я взагалі нічого не витрачав?",
        "difficulty": "hard",
        "query_type": "missing_days",
        "reference_sql": """
            WITH RECURSIVE april_days(d) AS (
                SELECT '2026-04-01'
                UNION ALL
                SELECT date(d, '+1 day') FROM april_days WHERE d < '2026-04-30'
            )
            SELECT COUNT(*) AS no_spend_days
            FROM april_days
            WHERE d NOT IN (
                SELECT DISTINCT transaction_date FROM transactions
                WHERE amount<0 AND transaction_date BETWEEN '2026-04-01' AND '2026-04-30'
            )
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 0,
        "notes": {
            "tool_use": "medium — потребує функції з date arithmetic",
            "text_to_sql": "hard — recursive CTE або складна логіка",
            "rag": "fail — питання про відсутні дані принципово недосяжне для RAG"
        }
    },
    {
        "id": 15,
        "question_uk": "Який середній чек у кав'ярнях vs у ресторанах? Де я витрачаю більше за один раз?",
        "difficulty": "hard",
        "query_type": "multi_aggregation_comparison",
        "reference_sql": """
            SELECT
                ROUND(AVG(CASE WHEN category='coffee' THEN -amount END), 2) AS coffee_avg,
                ROUND(AVG(CASE WHEN category='restaurants' THEN -amount END), 2) AS rest_avg
            FROM transactions
            WHERE amount<0 AND category IN ('coffee', 'restaurants')
        """,
        "evaluation": "comparison_with_values",
        "notes": {
            "tool_use": "medium",
            "text_to_sql": "medium — CASE WHEN AVG, або UNION/два запити",
            "rag": "fail"
        }
    },
    {
        "id": 16,
        "question_uk": "Яке співвідношення моїх обов'язкових витрат (продукти, комуналка, транспорт, здоров'я) до дискреційних (ресторани, кав'ярні, розваги, шопінг)?",
        "difficulty": "hard",
        "query_type": "ratio_across_categories",
        "reference_sql": """
            SELECT
                ROUND(SUM(CASE WHEN category IN ('groceries','utilities','transport','health')
                               THEN -amount ELSE 0 END), 2) AS essential,
                ROUND(SUM(CASE WHEN category IN ('restaurants','coffee','entertainment','shopping')
                               THEN -amount ELSE 0 END), 2) AS discretionary
            FROM transactions
            WHERE amount<0
        """,
        "evaluation": "ratio_with_values",
        "notes": {
            "tool_use": "medium — потребує композиції викликів",
            "text_to_sql": "medium-hard — потребує розуміння категорій",
            "rag": "fail — складна аналітика по великих категоріальних групах"
        }
    },
    {
        "id": 17,
        "question_uk": "Скільки я витратив на каву у вихідні дні (субота, неділя)?",
        "difficulty": "hard",
        "query_type": "weekday_filter_aggregation",
        "reference_sql": """
            SELECT ROUND(SUM(-amount), 2) AS total, COUNT(*) AS n
            FROM transactions
            WHERE category='coffee' AND amount<0
              AND CAST(strftime('%w', transaction_date) AS INTEGER) IN (0, 6)
        """,
        "evaluation": "exact_numeric",
        "tolerance_pct": 1.0,
        "notes": {
            "tool_use": "medium — потребує date filter у функції",
            "text_to_sql": "hard — strftime('%w'), пам'ятати що 0=неділя в SQLite",
            "rag": "fail — date arithmetic не для RAG"
        }
    },
    {
        "id": 18,
        "question_uk": "На скільки відсотків мої витрати на ресторани змінилися між січнем і квітнем?",
        "difficulty": "hard",
        "query_type": "trend_percentage_change",
        "reference_sql": """
            WITH monthly AS (
                SELECT
                    SUM(CASE WHEN strftime('%Y-%m', transaction_date)='2026-01' THEN -amount ELSE 0 END) AS jan,
                    SUM(CASE WHEN strftime('%Y-%m', transaction_date)='2026-04' THEN -amount ELSE 0 END) AS apr
                FROM transactions WHERE category='restaurants' AND amount<0
            )
            SELECT ROUND(jan, 2) AS jan, ROUND(apr, 2) AS apr,
                   ROUND((apr - jan) * 100.0 / jan, 2) AS pct_change
            FROM monthly
        """,
        "evaluation": "percentage_with_direction",
        "tolerance_pct": 2.0,
        "notes": {
            "tool_use": "medium",
            "text_to_sql": "hard — CTE, відсоткова зміна",
            "rag": "fail"
        }
    },

    # ---------- TRAPS: тест на галюцинації ----------
    {
        "id": 19,
        "question_uk": "Скільки я витратив на алкоголь за останній місяць?",
        "difficulty": "trap",
        "query_type": "no_data_category",
        "reference_sql": """
            SELECT COUNT(*) AS n FROM transactions
            WHERE category='alcohol' OR description LIKE '%алкоголь%'
              OR description LIKE '%вино%' OR description LIKE '%горілка%'
              OR description LIKE '%пиво%'
        """,
        "evaluation": "expect_zero_or_disclaimer",
        "expected_behavior": "Система має відповісти, що такої категорії немає в даних, або повернути 0 без вигадування числа",
        "notes": {
            "tool_use": "проходить — функція не знайде, поверне порожній результат",
            "text_to_sql": "проходить — SUM повертає NULL/0",
            "rag": "ризик — може 'знайти' семантично схожі транзакції (ресторани, бари) і дати неправильну суму"
        }
    },
    {
        "id": 20,
        "question_uk": "Скільки я витратив на бензин за весь період?",
        "difficulty": "trap",
        "query_type": "no_data_category",
        "reference_sql": """
            SELECT COUNT(*) AS n FROM transactions
            WHERE description LIKE '%бензин%' OR description LIKE '%пальне%'
              OR description LIKE '%заправка%' OR merchant LIKE '%OKKO%'
              OR merchant LIKE '%WOG%' OR merchant LIKE '%Shell%'
        """,
        "evaluation": "expect_zero_or_disclaimer",
        "expected_behavior": "Немає АЗС у даних → відповідь '0' або 'немає таких транзакцій'. RAG може помилково запропонувати транспорт (Uklon, Uber).",
        "notes": {
            "tool_use": "проходить",
            "text_to_sql": "проходить",
            "rag": "висока ймовірність галюцинації — семантично 'транспорт' близько до 'бензину'"
        }
    },
]


def compute_answers(db_path):
    """Виконує reference_sql для кожного питання, додає 'expected' з реальними даними."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    for q in QUESTIONS:
        rows = conn.execute(q["reference_sql"]).fetchall()
        rows_dict = [dict(r) for r in rows]

        if q["evaluation"] == "exact_numeric":
            # Беремо перше значення першого рядка незалежно від назви колонки
            first_row = rows_dict[0]
            first_val = next(iter(first_row.values())) if first_row else 0
            q["expected"] = {
                "value": first_val if first_val is not None else 0,
                "type": "numeric",
            }
        elif q["evaluation"] == "ranked_set_with_amounts":
            q["expected"] = {
                "items": [
                    {
                        "rank": i + 1,
                        "date": r["transaction_date"],
                        "merchant": r["merchant"],
                        "amount": round(r["amt"], 2),
                        "description": r.get("description", ""),
                    }
                    for i, r in enumerate(rows_dict)
                ],
                "type": "ranked_list",
            }
        elif q["evaluation"] == "category_match":
            q["expected"] = {
                "category": rows_dict[0]["category"],
                "total": round(rows_dict[0]["total"], 2),
                "type": "category",
            }
        elif q["evaluation"] == "month_match":
            q["expected"] = {
                "month": rows_dict[0]["month"],
                "total": round(rows_dict[0]["total"], 2),
                "type": "month",
            }
        elif q["evaluation"] == "comparison_with_values":
            row = rows_dict[0]
            keys = list(row.keys())
            v1, v2 = row[keys[0]], row[keys[1]]
            q["expected"] = {
                keys[0]: round(v1, 2),
                keys[1]: round(v2, 2),
                "winner": keys[0] if v1 > v2 else keys[1],
                "diff": round(abs(v1 - v2), 2),
                "type": "comparison",
            }
        elif q["evaluation"] == "merchant_set":
            q["expected"] = {
                "merchants": sorted(set(r["merchant"] for r in rows_dict)),
                "count": len(rows_dict),
                "details": rows_dict,
                "type": "merchant_set",
            }
        elif q["evaluation"] == "ratio_with_values":
            row = rows_dict[0]
            ess = row["essential"]
            disc = row["discretionary"]
            q["expected"] = {
                "essential": round(ess, 2),
                "discretionary": round(disc, 2),
                "ratio_essential_to_discretionary": round(ess / disc, 3),
                "essential_share_pct": round(ess * 100 / (ess + disc), 2),
                "type": "ratio",
            }
        elif q["evaluation"] == "percentage_with_direction":
            row = rows_dict[0]
            q["expected"] = {
                "jan": round(row["jan"], 2),
                "apr": round(row["apr"], 2),
                "pct_change": round(row["pct_change"], 2),
                "direction": "increase" if row["pct_change"] > 0 else "decrease",
                "type": "pct_change",
            }
        elif q["evaluation"] == "expect_zero_or_disclaimer":
            q["expected"] = {
                "value": 0,
                "valid_responses": [
                    "0",
                    "не знайдено",
                    "немає таких транзакцій",
                    "немає даних",
                    "no data",
                ],
                "type": "trap_no_data",
            }

    conn.close()
    return QUESTIONS


def main(db_path, out_path):
    questions = compute_answers(db_path)
    payload = {
        "meta": {
            "version": "1.0",
            "n_questions": len(questions),
            "language": "uk",
            "db_source": "transactions.db",
            "description": (
                "Golden dataset для оцінки tool-use vs RAG vs text-to-SQL "
                "у системах фінансової аналітики з природномовним інтерфейсом."
            ),
            "difficulty_distribution": {
                "easy": sum(1 for q in questions if q["difficulty"] == "easy"),
                "medium": sum(1 for q in questions if q["difficulty"] == "medium"),
                "hard": sum(1 for q in questions if q["difficulty"] == "hard"),
                "trap": sum(1 for q in questions if q["difficulty"] == "trap"),
            },
        },
        "questions": questions,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Збережено {len(questions)} питань у {out_path}")
    return payload


if __name__ == "__main__":
    import sys, os
    db = sys.argv[1] if len(sys.argv) > 1 else "transactions.db"
    out = sys.argv[2] if len(sys.argv) > 2 else "golden_dataset.json"
    main(db, out)
