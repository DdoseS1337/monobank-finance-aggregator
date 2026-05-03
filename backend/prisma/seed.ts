import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface MccSeedEntry {
  mcc: number;
  group_code: string;
  group_name: string;
  short_description: string;
  full_description: string;
  normalized_category: string;
  subcategory: string;
}

interface MerchantRuleSeedEntry {
  pattern: string;
  matchType: string;
  field: string;
  category: string;
  subcategory?: string;
  priority: number;
}

async function main() {
  // Seed MCC reference
  const mccSeedPath = path.resolve(__dirname, '../mcc_normalization_seed.json');
  const mccRaw = fs.readFileSync(mccSeedPath, 'utf-8');
  const mccEntries: MccSeedEntry[] = JSON.parse(mccRaw);

  console.log(`Seeding ${mccEntries.length} MCC reference records...`);
  const mccResult = await prisma.mccReference.createMany({
    data: mccEntries.map((e) => ({
      mcc: e.mcc,
      groupCode: e.group_code,
      groupName: e.group_name,
      shortDescription: e.short_description,
      fullDescription: e.full_description,
      normalizedCategory: e.normalized_category,
      subcategory: e.subcategory,
    })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${mccResult.count} new MCC reference records.`);

  // Seed merchant rules
  const merchantSeedPath = path.resolve(__dirname, '../merchant_rules_seed.json');
  const merchantRaw = fs.readFileSync(merchantSeedPath, 'utf-8');
  const merchantEntries: MerchantRuleSeedEntry[] = JSON.parse(merchantRaw);

  console.log(`Seeding ${merchantEntries.length} merchant rule records...`);
  const merchantResult = await prisma.merchantRule.createMany({
    data: merchantEntries.map((e) => ({
      pattern: e.pattern,
      matchType: e.matchType,
      field: e.field,
      category: e.category,
      subcategory: e.subcategory ?? null,
      priority: e.priority,
    })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${merchantResult.count} new merchant rule records.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
