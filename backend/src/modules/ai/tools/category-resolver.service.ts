import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { EmbeddingService } from '../../../shared-kernel/ai/embedding.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEMANTIC_THRESHOLD = 0.45;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  parentName: string | null;
  embedding: Float32Array | null;
}

/**
 * Maps free-form category hints (Ukrainian words, English slugs, partial
 * names) onto category ids using a layered strategy:
 *
 *   1. UUID    — pass-through.
 *   2. exact   — slug or name (case-insensitive) equality.
 *   3. alias   — small Ukrainian-vocabulary dictionary for the most common
 *                colloquial terms ("квартира" → "Житло").
 *   4. substring — name contains hint or vice-versa, with shortest-name
 *                  preference for specificity.
 *   5. semantic  — cosine similarity between the hint embedding and each
 *                  category embedding, OpenAI text-embedding-3-small.
 *                  This is the "AI self-validation" layer the user asked
 *                  for: the agent doesn't have to know the exact catalog,
 *                  it can describe the bucket and the resolver figures it
 *                  out via vectors.
 *
 * Each step is deterministic and explainable — for the thesis we can show
 * which strategy resolved each line in the staged-action preview.
 */
@Injectable()
export class CategoryResolverService {
  private readonly logger = new Logger(CategoryResolverService.name);
  private cache: { fetchedAt: number; entries: CatalogEntry[] } | null = null;
  private readonly aliases: Record<string, string> = {
    квартира: 'housing',
    оренда: 'housing--rent',
    комуналка: 'housing--utilities',
    'комунальні послуги': 'housing--utilities',
    продукти: 'food--groceries',
    харчі: 'food--groceries',
    їжа: 'food',
    кафе: 'food--coffee-shops',
    кава: 'food--coffee-shops',
    ресторан: 'food--restaurants',
    фастфуд: 'food--fast-food',
    авто: 'auto',
    машина: 'auto',
    бензин: 'auto--gas-station',
    заправка: 'auto--gas-station',
    паркінг: 'auto--parking',
    таксі: 'transport--taxi',
    медицина: 'health',
    лікар: 'health--doctors',
    аптека: 'health--pharmacy',
    одяг: 'shopping--clothing',
    взуття: 'shopping--clothing',
    електроніка: 'shopping--electronics',
    стрімінг: 'subscriptions--streaming',
    підписки: 'subscriptions',
    мобільний: 'utilities--mobile',
    телефон: 'utilities--mobile',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async resolve(hint: string | null | undefined): Promise<{
    categoryId: string | null;
    strategy:
      | 'none'
      | 'uuid'
      | 'exact-slug'
      | 'exact-name'
      | 'alias'
      | 'name-contains-hint'
      | 'hint-contains-name'
      | 'slug-stem'
      | 'semantic';
    similarity?: number;
    matchedName?: string;
  }> {
    if (!hint) return { categoryId: null, strategy: 'none' };
    if (UUID_RE.test(hint)) return { categoryId: hint, strategy: 'uuid' };
    const needle = hint.trim().toLowerCase();
    if (!needle) return { categoryId: null, strategy: 'none' };

    const catalog = await this.loadCatalog();

    const exactSlug = catalog.find((c) => c.slug.toLowerCase() === needle);
    if (exactSlug) {
      return {
        categoryId: exactSlug.id,
        strategy: 'exact-slug',
        matchedName: exactSlug.name,
      };
    }
    const exactName = catalog.find((c) => c.name.toLowerCase() === needle);
    if (exactName) {
      return {
        categoryId: exactName.id,
        strategy: 'exact-name',
        matchedName: exactName.name,
      };
    }
    const aliasSlug = this.aliases[needle];
    if (aliasSlug) {
      const byAlias = catalog.find((c) => c.slug === aliasSlug);
      if (byAlias) {
        return {
          categoryId: byAlias.id,
          strategy: 'alias',
          matchedName: byAlias.name,
        };
      }
    }
    const containedInName = catalog
      .filter((c) => c.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.length - b.name.length)[0];
    if (containedInName) {
      return {
        categoryId: containedInName.id,
        strategy: 'name-contains-hint',
        matchedName: containedInName.name,
      };
    }
    const reverseContained = catalog
      .filter((c) => needle.includes(c.name.toLowerCase()) && c.name.length >= 3)
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (reverseContained) {
      return {
        categoryId: reverseContained.id,
        strategy: 'hint-contains-name',
        matchedName: reverseContained.name,
      };
    }
    const slugStem = catalog
      .filter((c) => c.slug.toLowerCase().split(/[-/]+/).includes(needle))
      .sort((a, b) => a.slug.length - b.slug.length)[0];
    if (slugStem) {
      return {
        categoryId: slugStem.id,
        strategy: 'slug-stem',
        matchedName: slugStem.name,
      };
    }

    // Last layer: semantic match via embeddings. Skip if the embedding
    // service isn't configured (no OPENAI_API_KEY) — we don't want to
    // silently match against zero vectors.
    if (!this.embeddings.isAvailable()) {
      return { categoryId: null, strategy: 'none' };
    }
    const hintVector = await this.embeddings.embed(hint);
    if (!hintVector) {
      return { categoryId: null, strategy: 'none' };
    }
    let best: { entry: CatalogEntry; sim: number } | null = null;
    for (const c of catalog) {
      if (!c.embedding) continue;
      const sim = EmbeddingService.similarity(hintVector, c.embedding);
      if (!best || sim > best.sim) best = { entry: c, sim };
    }
    if (best && best.sim >= SEMANTIC_THRESHOLD) {
      return {
        categoryId: best.entry.id,
        strategy: 'semantic',
        similarity: Number(best.sim.toFixed(4)),
        matchedName: best.entry.name,
      };
    }
    return { categoryId: null, strategy: 'none' };
  }

  private async loadCatalog(): Promise<CatalogEntry[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CATALOG_CACHE_TTL_MS) {
      return this.cache.entries;
    }
    const rows = await this.prisma.category.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        parent: { select: { name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Compose a richer text for the embedding so the vector captures the
    // category in context — "Авто › Паркінг" matches "паркінг" better than
    // just "Паркінг".
    const texts = rows.map((r) => {
      const parent = r.parent?.name;
      return parent
        ? `Категорія "${r.name}" (підкатегорія "${parent}")`
        : `Категорія "${r.name}"`;
    });

    const vectors = this.embeddings.isAvailable()
      ? await this.embeddings.embedBatch(texts)
      : rows.map(() => null);

    const entries: CatalogEntry[] = rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      parentName: r.parent?.name ?? null,
      embedding: vectors[i] ?? null,
    }));
    this.cache = { fetchedAt: now, entries };
    return entries;
  }
}
