/**
 * Error reporting to the backend (`POST /api/client-errors`), which appends
 * each report to `client-errors.jsonl` on ibp-server for the weekly digest
 * (design: `docs/error-reporting.md` in the IBP meta repo).
 *
 * Reported: uncaught errors (`window` `error`), unhandled promise
 * rejections, errors an `ErrorBoundary` catches, and React Query errors
 * that are a 5xx answer or a response that failed to parse
 * (`shouldReportQueryError`). Not reported: network failures (the server
 * can't be reached to take them) and 4xx answers, which the pages handle.
 *
 * The same message is sent at most once a minute per tab. Reporting never
 * throws and is never itself reported: a report that fails is dropped.
 */
import { API_BASE_URL, ApiError } from './api/client';

export const CLIENT_ERRORS_PATH = '/client-errors';
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || 'dev';

/** The same message is sent at most once in this many milliseconds. */
export const REPEAT_INTERVAL_MS = 60 * 1000;
/** The backend refuses a body over 16 KiB; stay under it. */
const MAX_BODY_BYTES = 15 * 1024;
const MAX_MSG_CHARS = 1000;
const MAX_EXC_CHARS = 8000;
const MAX_REMEMBERED = 200;

export interface ErrorReport {
  /** Where it came from, e.g. `window.onerror`, `ErrorBoundary`. */
  logger: string;
  msg: string;
  /** The JavaScript stack, when there is one. */
  exc?: string;
  level?: 'WARNING' | 'ERROR' | 'CRITICAL';
  /** Extra context; `url` (the page path) is always added. */
  data?: Record<string, unknown>;
}

const lastSent = new Map<string, number>();
let sending = false;

/** Forget which messages were sent (for tests). */
export function resetErrorReporting() {
  lastSent.clear();
  sending = false;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** The page path, without the query string or fragment. */
function pagePath(): string {
  try {
    return window.location.pathname;
  } catch {
    return '';
  }
}

/**
 * `name: message` and the stack of anything thrown. The stack starts with
 * the `name: message` line, as Chrome writes it (Firefox leaves it out).
 */
export function describeError(error: unknown): { msg: string; exc?: string } {
  if (error instanceof Error) {
    const msg = `${error.name}: ${error.message}`;
    const stack = typeof error.stack === 'string' ? error.stack : '';
    if (!stack) return { msg };
    return { msg, exc: stack.startsWith(msg) ? stack : `${msg}\n${stack}` };
  }
  try {
    return { msg: typeof error === 'string' ? error : `Non-Error thrown: ${String(error)}` };
  } catch {
    return { msg: 'Non-Error thrown' };
  }
}

/** Whether `message` may be sent now; marks it sent if so. */
function takeSlot(message: string, now: number): boolean {
  const last = lastSent.get(message);
  if (last !== undefined && now - last < REPEAT_INTERVAL_MS) return false;
  if (lastSent.size >= MAX_REMEMBERED) {
    for (const [key, time] of lastSent) {
      if (now - time >= REPEAT_INTERVAL_MS) lastSent.delete(key);
    }
    if (lastSent.size >= MAX_REMEMBERED) return false;
  }
  lastSent.set(message, now);
  return true;
}

function buildBody(report: ErrorReport): string {
  const event: Record<string, unknown> = {
    level: report.level ?? 'ERROR',
    app: 'frontend',
    version: APP_VERSION,
    logger: report.logger,
    msg: truncate(report.msg, MAX_MSG_CHARS),
    data: { ...report.data, url: pagePath() },
  };
  if (report.exc) event.exc = truncate(report.exc, MAX_EXC_CHARS);
  let body = JSON.stringify(event);
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    delete event.exc;
    event.data = { url: pagePath() };
    body = JSON.stringify(event);
  }
  return body;
}

/**
 * Send one report. Never throws; a repeat of a message sent less than a
 * minute ago, and anything raised while reporting, are dropped.
 */
export function reportError(report: ErrorReport): void {
  if (sending) return; // an error raised by reporting itself
  sending = true;
  try {
    if (!takeSlot(report.msg, Date.now())) return;
    const sent = fetch(`${API_BASE_URL}${CLIENT_ERRORS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildBody(report),
      keepalive: true,
    });
    Promise.resolve(sent).catch(() => {});
  } catch {
    // Reporting must never fail the page, nor report itself.
  } finally {
    sending = false;
  }
}

/**
 * A React Query error worth reporting: a 5xx answer, or a response that
 * failed to parse (`response.json()` raises a SyntaxError). Network
 * failures (a TypeError from fetch) and 4xx answers are not.
 */
export function shouldReportQueryError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  return error instanceof SyntaxError;
}

/** React Query's global `onError`: report what `shouldReportQueryError` takes. */
export function reportQueryError(source: 'query' | 'mutation', error: unknown): void {
  try {
    if (!shouldReportQueryError(error)) return;
    const data: Record<string, unknown> = {};
    if (error instanceof ApiError) data.status = error.status;
    reportError({ logger: `react-query.${source}`, ...describeError(error), data });
  } catch {
    // never throw from a cache callback
  }
}

/**
 * Report uncaught errors and unhandled rejections from the whole page.
 * Returns a function that removes the handlers.
 */
export function installErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    try {
      // A cross-origin script's error carries nothing to go on.
      if (!event.error && (!event.message || event.message === 'Script error.')) return;
      const described = event.error
        ? describeError(event.error)
        : { msg: event.message, exc: undefined };
      const where = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '';
      reportError({
        logger: 'window.onerror',
        ...described,
        data: where ? { source: where } : undefined,
      });
    } catch {
      // never throw from an error handler
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    try {
      reportError({ logger: 'unhandledrejection', ...describeError(event.reason) });
    } catch {
      // never throw from an error handler
    }
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
