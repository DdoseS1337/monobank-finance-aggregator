-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEBIT', 'CREDIT', 'TRANSFER', 'HOLD');

-- CreateTable
CREATE TABLE "mcc_reference" (
    "mcc" INTEGER NOT NULL,
    "group_code" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "short_description" TEXT NOT NULL,
    "full_description" TEXT NOT NULL,
    "normalized_category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcc_reference_pkey" PRIMARY KEY ("mcc")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "name" TEXT,
    "currency" VARCHAR(10) NOT NULL,
    "account_type" TEXT,
    "balance" DECIMAL(18,2),
    "masked_pan" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "operation_amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "cashback_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2) NOT NULL,
    "description_raw" TEXT NOT NULL,
    "merchant_name_clean" TEXT,
    "mcc" INTEGER,
    "mcc_category" TEXT,
    "transaction_type" "TransactionType" NOT NULL,
    "transaction_time" TIMESTAMP(3) NOT NULL,
    "raw_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_rules" (
    "id" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "match_type" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_source_external_account_id_key" ON "accounts"("user_id", "source", "external_account_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_account_id_idx" ON "transactions"("account_id");

-- CreateIndex
CREATE INDEX "transactions_transaction_time_idx" ON "transactions"("transaction_time");

-- CreateIndex
CREATE INDEX "transactions_mcc_idx" ON "transactions"("mcc");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_source_external_id_key" ON "transactions"("source", "external_id");

-- CreateIndex
CREATE INDEX "merchant_rules_is_active_priority_idx" ON "merchant_rules"("is_active", "priority");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
