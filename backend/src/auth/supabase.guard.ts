import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { SupabaseService } from './supabase.service';
import { PrismaService } from '../shared-kernel/prisma/prisma.service';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

interface SupabaseJwtPayload extends JwtPayload {
  sub: string;
  email?: string;
  role?: string;
}

/**
 * Hybrid auth guard.
 *
 *   - If SUPABASE_JWT_SECRET is configured → verifies JWT locally (HS256)
 *     in ~0.5 ms with no network call. Production-recommended path.
 *   - Otherwise → falls back to `supabase.auth.getUser(token)` which
 *     issues a network call to the Supabase Auth API. Works, but adds
 *     50–200 ms latency per request.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly jwtSecret: string;
  private readonly provisioned = new Set<string>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.jwtSecret = config.get<string>('SUPABASE_JWT_SECRET', '');
    if (!this.jwtSecret) {
      this.logger.warn(
        'SUPABASE_JWT_SECRET is not set — falling back to remote token verification (slower).',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let user: { id: string; email: string } | null = null;
    if (this.jwtSecret && this.tokenIsHs256(token)) {
      // Legacy HS256 path — also accepts JWTs we mint ourselves in the eval
      // harness. Fast (no network call).
      user = this.verifyLocally(token);
    } else {
      // New asymmetric (ES256/RS256) Supabase tokens — defer to the SDK.
      // It knows about the project's JWKS / signing keys.
      user = await this.verifyRemote(token);
    }

    await this.ensureUserRow(user);
    req.user = user;
    return true;
  }

  /**
   * Cheap header inspection — decodes the JWT prelude WITHOUT verifying it
   * so we can pick the right verification path. Returns false for malformed
   * tokens; downstream verifier will reject them too.
   */
  private tokenIsHs256(token: string): boolean {
    const headerPart = token.split('.')[0];
    if (!headerPart) return false;
    try {
      const json = Buffer.from(headerPart, 'base64url').toString('utf8');
      const header = JSON.parse(json) as { alg?: string };
      return header.alg === 'HS256';
    } catch {
      return false;
    }
  }

  private async ensureUserRow(user: { id: string; email: string }): Promise<void> {
    if (this.provisioned.has(user.id)) return;
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, email: user.email || `${user.id}@unknown.local` },
      update: user.email ? { email: user.email } : {},
    });
    this.provisioned.add(user.id);
  }

  private verifyLocally(token: string): { id: string; email: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as SupabaseJwtPayload;

      if (!payload.sub) {
        throw new UnauthorizedException('Token has no subject');
      }
      return {
        id: payload.sub,
        email: payload.email ?? '',
      };
    } catch (error) {
      this.logger.debug(`Local JWT verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async verifyRemote(token: string): Promise<{ id: string; email: string }> {
    const { data, error } = await this.supabase.client().auth.getUser(token);
    if (error || !data.user) {
      this.logger.debug(`Remote token validation failed: ${error?.message ?? 'no user'}`);
      throw new UnauthorizedException('Invalid token');
    }
    return {
      id: data.user.id,
      email: data.user.email ?? '',
    };
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
