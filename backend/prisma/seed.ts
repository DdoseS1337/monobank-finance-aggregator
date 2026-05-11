import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const prisma = new PrismaClient();

interface MccSeedRow {
  mcc: number;
  group_code: string;
  group_name: string;
  short_description: string;
  full_description: string;
  normalized_category: string;
  subcategory: string;
}

interface MerchantRuleRow {
  pattern: string;
  matchType: 'EXACT' | 'CONTAINS' | 'REGEX';
  field: 'BOTH' | 'DESCRIPTION' | 'MERCHANT';
  category: string;
  subcategory: string;
  priority: number;
}

/**
 * Merchant rules use a different taxonomy than MCC mappings.
 * To keep the category tree single-rooted, we normalize merchant categories
 * onto MCC's canonical names *at seed time*.
 * The keys are exactly `${category}/${subcategory}` from merchant_rules_seed.json.
 */
const MERCHANT_TAXONOMY_NORMALIZATION: Record<
  string,
  { category: string; subcategory: string }
> = {
  // Food & Dining → MCC "Food"
  'Food & Dining/FastFood': { category: 'Food', subcategory: 'Fast Food' },
  'Food & Dining/Restaurant': { category: 'Food', subcategory: 'Restaurants' },
  'Food & Dining/CoffeeShop': { category: 'Food', subcategory: 'Coffee Shops' },

  // Groceries → MCC "Food/Groceries" / "Shopping/Wholesale"
  'Groceries/Supermarket': { category: 'Food', subcategory: 'Groceries' },
  'Groceries/Wholesale': { category: 'Shopping', subcategory: 'Wholesale' },

  // Delivery → MCC "Services"
  'Delivery/Courier': { category: 'Services', subcategory: 'Courier' },
  'Delivery/Postal': { category: 'Services', subcategory: 'Postal' },

  // Health
  'Health/Pharmacy': { category: 'Health', subcategory: 'Pharmacy' },

  // Transport — fuel stations belong to Auto in MCC
  'Transport/Taxi': { category: 'Transport', subcategory: 'Taxi' },
  'Transport/FuelStation': { category: 'Auto', subcategory: 'Gas Station' },

  // Finance — kept as a separate top-level (no exact MCC equivalent)
  'Finance/Banking': { category: 'Finance', subcategory: 'Banking' },

  // Entertainment vs Subscriptions — streaming services live under Subscriptions
  'Entertainment/Gaming': { category: 'Entertainment', subcategory: 'Gaming' },
  'Entertainment/Streaming': { category: 'Subscriptions', subcategory: 'Streaming' },

  // Shopping
  'Shopping/Electronics': { category: 'Shopping', subcategory: 'Electronics' },
  'Shopping/Online': { category: 'Shopping', subcategory: 'Online' },
  'Shopping/Marketplace': { category: 'Shopping', subcategory: 'Marketplace' },

  // Utilities — communal payments go under Housing per MCC's structure
  'Utilities/Mobile': { category: 'Utilities', subcategory: 'Mobile' },
  'Utilities/Housing': { category: 'Housing', subcategory: 'Utilities' },
};

function normalizeMerchantRule(row: MerchantRuleRow): MerchantRuleRow {
  const key = `${row.category}/${row.subcategory}`;
  const mapped = MERCHANT_TAXONOMY_NORMALIZATION[key];
  if (!mapped) {
    return row;
  }
  return { ...row, category: mapped.category, subcategory: mapped.subcategory };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ukrainian display names for the seeded English-source categories.
 * The slug stays English (stable for code/joins); the visible name is
 * translated so the AI agent can match user phrasing like "Паркінг".
 */
const UA_NAMES: Record<string, string> = {
  // Top-level
  Food: "Їжа та напої",
  Transport: 'Транспорт',
  Auto: 'Авто',
  Housing: 'Житло',
  Health: "Здоров'я",
  Shopping: 'Покупки',
  Entertainment: 'Розваги',
  Subscriptions: 'Підписки',
  Services: 'Послуги',
  Travel: 'Подорожі',
  Utilities: 'Комунальні',
  Finance: 'Фінанси',
  Education: 'Освіта',
  Beauty: 'Краса',
  Pets: 'Тварини',
  Government: 'Держ. послуги',
  Charity: 'Благодійність',
  Cash: 'Готівка',
  Transfers: 'Перекази',
  Insurance: 'Страхування',
  Investments: 'Інвестиції',
  Other: 'Інше',
  // Subcategories — most common ones; extend as needed
  Parking: 'Паркінг',
  'Gas Station': 'АЗС',
  Restaurants: 'Ресторани',
  Groceries: 'Продукти',
  'Fast Food': 'Фастфуд',
  'Coffee Shops': "Кав'ярні",
  Pharmacy: 'Аптека',
  Mobile: 'Мобільний зв’язок',
  Streaming: 'Стрімінг',
  Gaming: 'Ігри',
  Electronics: 'Електроніка',
  Online: 'Онлайн',
  Marketplace: 'Маркетплейс',
  Banking: 'Банкінг',
  Taxi: 'Таксі',
  Courier: "Кур'єр",
  Postal: 'Пошта',
  Wholesale: 'Опт',
  Rent: 'Оренда',
  Hotels: 'Готелі',
  Airlines: 'Авіакомпанії',
  Books: 'Книги',
  Clothing: 'Одяг',
  Doctors: 'Лікарі',
  Dental: 'Стоматологія',
  Hospitals: 'Лікарні',
  Vet: 'Ветеринар',
  Repair: 'Ремонт',
  Cinema: 'Кіно',
  Music: 'Музика',
  Sports: 'Спорт',
  Gym: 'Спортзал',
};

function localize(name: string): string {
  return UA_NAMES[name] ?? name;
}

async function upsertCategory(
  slug: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) {
    if (existing.parentId !== parentId || existing.name !== name) {
      const updated = await prisma.category.update({
        where: { slug },
        data: { name, parentId },
      });
      return updated.id;
    }
    return existing.id;
  }
  const created = await prisma.category.create({
    data: { slug, name, parentId, isSystem: true },
  });
  return created.id;
}

async function seedCategories(
  mccRows: MccSeedRow[],
  merchantRows: MerchantRuleRow[],
): Promise<Map<string, string>> {
  // categoryKey = `${parent}/${child}` or `${parent}` for top-level
  // value = category id
  const map = new Map<string, string>();

  // 1. Top-level categories from both sources
  const topLevel = new Set<string>();
  mccRows.forEach((r) => topLevel.add(r.normalized_category));
  merchantRows.forEach((r) => topLevel.add(r.category));

  for (const name of topLevel) {
    const slug = slugify(name);
    const id = await upsertCategory(slug, localize(name), null);
    map.set(name, id);
  }

  // 2. Sub-categories from both sources
  const pairs = new Map<string, { parent: string; child: string }>();
  mccRows.forEach((r) => {
    if (r.subcategory) {
      pairs.set(`${r.normalized_category}/${r.subcategory}`, {
        parent: r.normalized_category,
        child: r.subcategory,
      });
    }
  });
  merchantRows.forEach((r) => {
    if (r.subcategory) {
      pairs.set(`${r.category}/${r.subcategory}`, {
        parent: r.category,
        child: r.subcategory,
      });
    }
  });

  for (const [key, { parent, child }] of pairs) {
    const parentId = map.get(parent);
    if (!parentId) continue;
    const slug = `${slugify(parent)}--${slugify(child)}`;
    const id = await upsertCategory(slug, localize(child), parentId);
    map.set(key, id);
  }

  return map;
}

async function seedMccMappings(
  rows: MccSeedRow[],
  map: Map<string, string>,
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const key = row.subcategory
      ? `${row.normalized_category}/${row.subcategory}`
      : row.normalized_category;
    const categoryId = map.get(key) ?? map.get(row.normalized_category);
    if (!categoryId) {
      console.warn(`  MCC ${row.mcc}: no category for "${key}"`);
      continue;
    }
    await prisma.mccMapping.upsert({
      where: { mccCode: row.mcc },
      create: {
        mccCode: row.mcc,
        categoryId,
        description: row.full_description,
        weight: new Prisma.Decimal(1),
      },
      update: {
        categoryId,
        description: row.full_description,
      },
    });
    count++;
  }
  return count;
}

async function seedMerchantRules(
  rows: MerchantRuleRow[],
  map: Map<string, string>,
): Promise<number> {
  // Wipe-and-reseed for merchant rules (small, idempotent)
  await prisma.merchantRule.deleteMany({});

  const data: Prisma.MerchantRuleCreateManyInput[] = [];
  for (const row of rows) {
    const key = row.subcategory ? `${row.category}/${row.subcategory}` : row.category;
    const categoryId = map.get(key) ?? map.get(row.category);
    if (!categoryId) {
      console.warn(`  Merchant rule "${row.pattern}": no category for "${key}"`);
      continue;
    }
    data.push({
      pattern: row.pattern,
      matchType: row.matchType,
      matchField: row.field,
      categoryId,
      priority: row.priority,
      enabled: true,
    });
  }

  if (data.length > 0) {
    await prisma.merchantRule.createMany({ data });
  }
  return data.length;
}

/**
 * Drops categories that aren't referenced by anything after the seed completes
 * (mcc_mappings, merchant_rules, transactions, budget_lines, child categories).
 * Iterates until the tree is stable so deleted leaves free up their parents.
 */
async function cleanupOrphanCategories(): Promise<number> {
  let totalRemoved = 0;
  for (let iteration = 0; iteration < 10; iteration++) {
    const removed = await prisma.$executeRaw`
      DELETE FROM categories
      WHERE id NOT IN (
        SELECT DISTINCT category_id FROM mcc_mappings WHERE category_id IS NOT NULL
        UNION
        SELECT DISTINCT category_id FROM merchant_rules WHERE category_id IS NOT NULL
        UNION
        SELECT DISTINCT category_id FROM budget_lines WHERE category_id IS NOT NULL
        UNION
        SELECT DISTINCT category_id FROM transactions WHERE category_id IS NOT NULL
        UNION
        SELECT DISTINCT parent_id FROM categories WHERE parent_id IS NOT NULL
      )
    `;
    if (removed === 0) break;
    totalRemoved += removed;
  }
  return totalRemoved;
}

async function main(): Promise<void> {
  const mccPath = resolve(__dirname, '..', 'mcc_normalization_seed.json');
  const merchantPath = resolve(__dirname, '..', 'merchant_rules_seed.json');

  const mccRows = JSON.parse(readFileSync(mccPath, 'utf8')) as MccSeedRow[];
  const rawMerchantRows = JSON.parse(readFileSync(merchantPath, 'utf8')) as MerchantRuleRow[];
  const merchantRows = rawMerchantRows.map(normalizeMerchantRule);

  console.log(
    `Loaded ${mccRows.length} MCC rows, ${merchantRows.length} merchant rules ` +
      `(after taxonomy normalization)`,
  );

  console.log('Seeding categories…');
  const map = await seedCategories(mccRows, merchantRows);
  console.log(`  → ${map.size} category nodes (top-level + subcategories)`);

  console.log('Seeding MCC mappings…');
  const mccCount = await seedMccMappings(mccRows, map);
  console.log(`  → ${mccCount} MCC mappings`);

  console.log('Seeding merchant rules…');
  const merchantCount = await seedMerchantRules(merchantRows, map);
  console.log(`  → ${merchantCount} merchant rules`);

  console.log('Cleaning up orphan categories from previous seeds…');
  const orphans = await cleanupOrphanCategories();
  console.log(`  → ${orphans} orphan categories removed`);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
