import { API_URL } from '../constants';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId: string;
  path: string;
  timestamp: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(
      Array.isArray(body.message) ? body.message.join('; ') : body.message,
    );
  }
}

export interface ApiCallOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Bearer token (Supabase access_token). Pass `null` to call public endpoints. */
  token: string | null;
  /** Forwarded to fetch(); see Next.js caching docs. */
  next?: { revalidate?: number; tags?: string[] };
}

/**
 * Single fetch wrapper used by all domain-specific helpers.
 *
 * Works in both Server Components (where caching/tags matter) and Client
 * Components (which pass a token via `useToken`).
 *
 * Convention: `path` MUST start with `/` and is joined with `NEXT_PUBLIC_API_URL`.
 * The base URL already includes the `/api/v1` prefix in `.env`.
 */
export async function apiCall<T>(
  path: string,
  options: ApiCallOptions = { token: null },
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body,
    cache: options.cache ?? 'no-store',
    next: options.next,
  });

  if (!response.ok) {
    const raw = await response.text();
    let errorBody: ApiErrorBody;
    try {
      errorBody = JSON.parse(raw) as ApiErrorBody;
    } catch {
      errorBody = {
        statusCode: response.status,
        error: response.statusText,
        message: raw,
        correlationId: 'unknown',
        path,
        timestamp: new Date().toISOString(),
      };
    }
    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204) return undefined as unknown as T;
  return (await response.json()) as T;
}

export type ApiCall = typeof apiCall;
