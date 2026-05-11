import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  parentSlug: string | null;
  isSystem: boolean;
}

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<CategoryDto[]> {
    const cats = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        parent: { select: { slug: true } },
        isSystem: true,
      },
    });
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      parentSlug: c.parent?.slug ?? null,
      isSystem: c.isSystem,
    }));
  }
}
