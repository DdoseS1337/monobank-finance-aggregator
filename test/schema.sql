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
