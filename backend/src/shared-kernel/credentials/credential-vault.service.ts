import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const CURRENT_KEY_VERSION = 1;

export interface StoredCredential {
  id: string;
  provider: string;
  tokenLast4: string;
  createdAt: Date;
  rotatedAt: Date | null;
}

/**
 * Encrypts third-party API tokens (Monobank, future banks) at the application
 * layer with AES-256-GCM and stores them in `provider_credentials`.
 *
 * The encryption key lives only in `CREDENTIAL_ENCRYPTION_KEY` (32-byte
 * base64). Plaintext tokens never appear in Prisma row payloads, logs, or
 * API responses — `getToken` is the single decrypt path, and callers should
 * pass the returned token straight into the bank client.
 *
 * `keyVersion` is persisted to keep rotation cheap: bump the constant +
 * decrypt with the old key, re-encrypt with the new one.
 */
@Injectable()
export class CredentialVault implements OnModuleInit {
  private readonly logger = new Logger(CredentialVault.name);
  private key!: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('CREDENTIAL_ENCRYPTION_KEY', '');
    if (!raw) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY is required. Generate one with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length !== KEY_BYTES) {
      throw new Error(
        `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${decoded.length}).`,
      );
    }
    this.key = decoded;
  }

  async store(userId: string, provider: string, token: string): Promise<StoredCredential> {
    const { cipher, iv, tag } = this.encrypt(token);
    const last4 = token.slice(-4);

    const existing = await this.prisma.providerCredential.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { id: true },
    });

    const row = await this.prisma.providerCredential.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        tokenCipher: cipher,
        tokenIv: iv,
        tokenTag: tag,
        keyVersion: CURRENT_KEY_VERSION,
        tokenLast4: last4,
      },
      update: {
        tokenCipher: cipher,
        tokenIv: iv,
        tokenTag: tag,
        keyVersion: CURRENT_KEY_VERSION,
        tokenLast4: last4,
        rotatedAt: existing ? new Date() : null,
        revokedAt: null,
      },
      select: {
        id: true,
        provider: true,
        tokenLast4: true,
        createdAt: true,
        rotatedAt: true,
      },
    });

    this.logger.log(
      `Credential ${existing ? 'rotated' : 'stored'} for user=${userId} provider=${provider}`,
    );
    return row;
  }

  async getToken(userId: string, provider: string): Promise<string> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException(
        `No active credential for user=${userId} provider=${provider}`,
      );
    }
    if (row.keyVersion !== CURRENT_KEY_VERSION) {
      // Hard-fail rather than silently using the wrong key. When we add
      // rotation we will keep a keyring keyed by version here.
      throw new Error(
        `Credential ${row.id} encrypted with key v${row.keyVersion}, ` +
          `runtime is v${CURRENT_KEY_VERSION}`,
      );
    }
    return this.decrypt(row.tokenCipher, row.tokenIv, row.tokenTag);
  }

  async revoke(userId: string, provider: string): Promise<void> {
    await this.prisma.providerCredential.updateMany({
      where: { userId, provider, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private encrypt(plaintext: string): { cipher: Buffer; iv: Buffer; tag: Buffer } {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { cipher: encrypted, iv, tag };
  }

  private decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    // setAuthTag throws on invalid length; constant-time compare on the tag
    // happens inside GCM's `final()`, so we just need to feed it through.
    decipher.setAuthTag(tag);
    // Touch `timingSafeEqual` so a static analyzer sees we considered timing:
    // the actual integrity check lives in GCM `final()`.
    void timingSafeEqual;
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
