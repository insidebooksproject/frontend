export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  status: number;
  /** The response body parsed as JSON, when it was JSON. */
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Extracts a human-readable error message from response text.
 * Attempts to parse as JSON and extract from common error fields (detail, message, error).
 * Falls back to raw text if JSON parsing fails.
 */
function extractErrorMessage(text: string): string {
  if (!text) return '';

  try {
    const json = JSON.parse(text);
    // FastAPI uses 'detail', but check common alternatives
    const message = json.detail ?? json.message ?? json.error ?? text;
    // If the message field is an object/array, stringify it
    return typeof message === 'string' ? message : JSON.stringify(message);
  } catch {
    // Not valid JSON, return raw text
    return text;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText;
    let body: unknown;

    try {
      const text = await response.text();
      body = parseJson(text);
      const extracted = extractErrorMessage(text);
      if (extracted) {
        message = extracted;
      }
    } catch (error) {
      console.error('Failed to read error response:', error);
    }

    throw new ApiError(response.status, message, body);
  }

  // Handle 204 No Content (no response body)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<T>(response);
}

export interface FieldValidationError {
  /** Dotted path to the offending field, relative to the request body (e.g. `address.zipcode`). */
  field: string;
  message: string;
}

/**
 * Extracts per-field errors from a FastAPI 422 validation error.
 *
 * FastAPI reports validation failures as `{"detail": [{"loc": ["body", ...], "msg": "..."}]}`;
 * the client serialises that `detail` array into the ApiError message. Returns an empty array
 * when the error is not a 422 or its body is not in that shape.
 */
export function getValidationErrors(error: unknown): FieldValidationError[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];

  let detail: unknown;
  try {
    detail = JSON.parse(error.message);
  } catch {
    return [];
  }
  if (!Array.isArray(detail)) return [];

  return detail.flatMap((item) => {
    if (!item || !Array.isArray(item.loc) || typeof item.msg !== 'string') return [];
    const path = item.loc[0] === 'body' ? item.loc.slice(1) : item.loc;
    return [{ field: path.join('.'), message: item.msg }];
  });
}
