// Test setup file for Vitest
import { afterEach } from 'vitest';
import { cleanup } from 'vitest-browser-react';
import { CLIENT_ERRORS_PATH } from '@/lib/errorReporting';

// Error reports from the tests' deliberate errors are answered here, never
// sent through the dev proxy to a backend that may be running. A test file
// that sets its own window.fetch sees every request, reports included.
const realFetch = window.fetch.bind(window);

function requestPath(input: RequestInfo | URL): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(url, window.location.href).pathname;
}

window.fetch = (input, init) => {
  if (requestPath(input).endsWith(CLIENT_ERRORS_PATH)) {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return realFetch(input, init);
};

// Cleanup after each test
afterEach(async () => {
  await cleanup();
});
