/**
 * One-shot indexer for the financial-literacy knowledge base.
 *
 * Reads `backend/education_seed.json`, asks OpenAI for an embedding of each
 * article (title + section + body), and upserts into `knowledge_documents`.
 * Idempotent: re-running updates rows by `(source, title)` and refreshes the
 * vector — useful when the seed text or embedding model changes.
 *
 * Run:
 *   npm --prefix backend run kb:index
 *
 * Requires OPENAI_API_KEY in backend/.env. Without it the script aborts —
 * we don't want to write zero vectors.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

interface SeedRow {
  source: string;
  title: string;
  section?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  version?: string | null;
  lang?: string;
}

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const SEED_PATH = resolve(__dirname, '..', 'education_seed.json');

function indexedText(row: SeedRow): string {
  const parts = [row.title];
  if (row.section) parts.push(`Розділ: ${row.section}`);
  parts.push(row.content);
  return parts.join('\n\n');
}

function toPgVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required to compute embeddings. Set it in backend/.env first.',
    );
  }

  const rows: SeedRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  console.log(`Loaded ${rows.length} knowledge articles from ${SEED_PATH}`);

  const openai = new OpenAI({ apiKey });
  const prisma = new PrismaClient();

  try {
    // OpenAI accepts up to ~2048 inputs per call; our seed is small so a
    // single batch is enough.
    const inputs = rows.map((r) => indexedText(r));
    console.log(`Requesting embeddings (${EMBEDDING_MODEL}) for ${inputs.length} docs…`);
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs,
    });

    if (embeddingResponse.data.length !== inputs.length) {
      throw new Error(
        `Embedding count mismatch: requested ${inputs.length}, got ${embeddingResponse.data.length}`,
      );
    }

    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const embedding = embeddingResponse.data[i]!.embedding;
      const literal = toPgVector(embedding);
      const lang = row.lang ?? 'uk';
      const version = row.version ?? '1';
      const metadata = JSON.stringify(row.metadata ?? {});

      // Upsert keyed on (source, title) — pg doesn't have a natural unique on
      // those two, so we emulate via an existence check.
      const existing = await prisma.knowledgeDocument.findFirst({
        where: { source: row.source, title: row.title },
        select: { id: true },
      });

      if (existing) {
        await prisma.$executeRawUnsafe(
          `
            UPDATE knowledge_documents
            SET section = $2,
                content = $3,
                embedding = $4::vector,
                metadata = $5::jsonb,
                lang = $6,
                version = $7,
                indexed_at = NOW()
            WHERE id = $1::uuid
          `,
          existing.id,
          row.section ?? null,
          row.content,
          literal,
          metadata,
          lang,
          version,
        );
        updated++;
      } else {
        const id = randomUUID();
        await prisma.$executeRawUnsafe(
          `
            INSERT INTO knowledge_documents (id, source, title, section, content, embedding, metadata, lang, version, indexed_at)
            VALUES ($1::uuid, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9, NOW())
          `,
          id,
          row.source,
          row.title,
          row.section ?? null,
          row.content,
          literal,
          metadata,
          lang,
          version,
        );
        inserted++;
      }
    }

    console.log(`Done. Inserted ${inserted}, updated ${updated}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
