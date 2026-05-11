import { randomUUID } from 'crypto';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ZodError } from 'zod';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId: string;
  path: string;
  timestamp: string;
  details?: unknown;
}

/**
 * Catch-all exception filter.
 *
 * Goals:
 *   - Never leak stack traces or Prisma internals to the HTTP client.
 *   - Stable JSON shape so the frontend can render errors consistently.
 *   - Correlate logs ↔ HTTP responses via `correlationId`.
 *
 * Mappings:
 *   - HttpException                       → its declared status + payload.
 *   - ZodError                            → 400, message[] of issue paths.
 *   - Prisma.PrismaClientKnownRequestError →
 *       P2002 (unique violation)  → 409
 *       P2025 (record not found)  → 404
 *       others                    → 400 with sanitized message.
 *   - Anything else                       → 500 with opaque correlationId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    const body = this.toBody(exception, request, correlationId);
    this.log(exception, body);

    response.status(body.statusCode).json(body);
  }

  private toBody(
    exception: unknown,
    request: Request,
    correlationId: string,
  ): ErrorBody {
    const base = {
      correlationId,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();
      const payload =
        typeof response === 'string'
          ? { message: response }
          : (response as Record<string, unknown>);
      return {
        ...base,
        statusCode: status,
        error: this.errorName(status),
        message:
          (payload.message as string | string[]) ?? exception.message ?? 'Error',
      };
    }

    if (exception instanceof ZodError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'ValidationError',
        message: exception.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnownError(exception, base);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'ValidationError',
        message: 'Invalid query payload',
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : (exception as Error)?.message ?? 'Unknown error',
    };
  }

  private fromPrismaKnownError(
    error: Prisma.PrismaClientKnownRequestError,
    base: { correlationId: string; path: string; timestamp: string },
  ): ErrorBody {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined)?.join(', ');
        return {
          ...base,
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: target
            ? `Unique constraint violated on (${target})`
            : 'Unique constraint violated',
        };
      }
      case 'P2025':
        return {
          ...base,
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFound',
          message: (error.meta?.cause as string | undefined) ?? 'Record not found',
        };
      default: {
        const detail =
          process.env.NODE_ENV === 'production'
            ? undefined
            : error.message.replace(/\s+/g, ' ').trim();
        return {
          ...base,
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequest',
          message: detail
            ? `Database error: ${error.code} — ${detail}`
            : `Database error: ${error.code}`,
        };
      }
    }
  }

  private errorName(status: number): string {
    if (status === HttpStatus.NOT_FOUND) return 'NotFound';
    if (status === HttpStatus.BAD_REQUEST) return 'BadRequest';
    if (status === HttpStatus.UNAUTHORIZED) return 'Unauthorized';
    if (status === HttpStatus.FORBIDDEN) return 'Forbidden';
    if (status === HttpStatus.CONFLICT) return 'Conflict';
    if (status === HttpStatus.TOO_MANY_REQUESTS) return 'TooManyRequests';
    if (status >= 500) return 'InternalServerError';
    return 'Error';
  }

  private log(exception: unknown, body: ErrorBody): void {
    if (body.statusCode >= 500) {
      this.logger.error(
        `[${body.correlationId}] ${body.path}: ${
          (exception as Error)?.message ?? 'unknown'
        }`,
        (exception as Error)?.stack,
      );
    } else if (body.statusCode >= 400) {
      this.logger.debug(
        `[${body.correlationId}] ${body.statusCode} ${body.path}: ${JSON.stringify(body.message)}`,
      );
    }
  }
}

// Re-exports for callers that want to construct typed errors that the filter will format consistently.
export { BadRequestException, NotFoundException };
