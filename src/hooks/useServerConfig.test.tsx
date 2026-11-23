import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { createWrapper } from '@/test/utils';
import { useServerTimeZone } from './useServerConfig';
import * as api from '@/lib/api/serverConfig';
import { ApiError } from '@/lib/api/client';

vi.mock('@/lib/api/serverConfig');

function TimeZoneTest() {
  return <div data-testid="zone">{useServerTimeZone()}</div>;
}

describe('useServerTimeZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the server's zone", async () => {
    vi.mocked(api.getServerConfig).mockResolvedValue({ timezone: 'Asia/Tokyo' });

    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <TimeZoneTest />
      </Wrapper>
    );

    await expect.element(page.getByTestId('zone')).toHaveTextContent('Asia/Tokyo');
  });

  it('falls back to Chicago when an older backend has no config endpoint', async () => {
    vi.mocked(api.getServerConfig).mockRejectedValue(new ApiError(404, 'Not Found'));

    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <TimeZoneTest />
      </Wrapper>
    );

    await expect.poll(() => api.getServerConfig).toHaveBeenCalled();
    await expect.element(page.getByTestId('zone')).toHaveTextContent('America/Chicago');
  });

  it('falls back to Chicago for a zone the browser does not know', async () => {
    vi.mocked(api.getServerConfig).mockResolvedValue({ timezone: 'Nowhere/Land' });

    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <TimeZoneTest />
      </Wrapper>
    );

    await expect.poll(() => api.getServerConfig).toHaveBeenCalled();
    await expect.element(page.getByTestId('zone')).toHaveTextContent('America/Chicago');
  });
});
