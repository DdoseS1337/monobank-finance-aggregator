-- Reclassify existing HOLD transactions (pending Monobank operations) into
-- DEBIT / CREDIT based on amount sign. Analytics queries filter by
-- transaction_type = 'DEBIT' or 'CREDIT' and ignored HOLDs entirely,
-- making pending purchases invisible in reports.

UPDATE "transactions"
SET "transaction_type" = 'DEBIT'
WHERE "transaction_type" = 'HOLD' AND "amount" < 0;

UPDATE "transactions"
SET "transaction_type" = 'CREDIT'
WHERE "transaction_type" = 'HOLD' AND "amount" > 0;
