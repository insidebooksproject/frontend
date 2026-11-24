import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { MetricsChart } from './MetricsChart';

const settled = { month: '2026-08', filled_count: 882, tossed_count: 52, total_count: 934 };
const recent = {
  month: '2026-10',
  filled_count: 56,
  tossed_count: 3,
  total_count: 59,
  provisional: true,
};

async function chartDrawn() {
  await expect.poll(() => document.querySelector('.recharts-wrapper')).toBeTruthy();
}

describe('MetricsChart', () => {
  it('marks the months still being answered as provisional', async () => {
    await render(<MetricsChart data={[settled, recent]} settleDays={67} />);
    await chartDrawn();

    await expect
      .element(page.getByText(/Months in the last 67 days are provisional \(faded, dashed\)/))
      .toBeVisible();
    // One hollow point per series, on the provisional month only.
    await expect.poll(() => document.querySelectorAll('circle[data-provisional]').length).toBe(2);
    const labels = [...document.querySelectorAll('circle[data-provisional]')].map((dot) =>
      dot.getAttribute('aria-label')
    );
    expect(new Set(labels)).toEqual(new Set(['2026-10: provisional, still being answered']));
  });

  it('fades the provisional bars', async () => {
    await render(<MetricsChart data={[settled, recent]} settleDays={67} />);
    await chartDrawn();
    await page.getByRole('button', { name: 'Bar' }).click();

    await expect
      .element(page.getByText(/Months in the last 67 days are provisional \(faded\)/))
      .toBeVisible();
    await expect
      .poll(() => document.querySelectorAll('.recharts-bar-rectangle [fill-opacity="0.4"]').length)
      .toBe(2);
  });

  it('says nothing about provisional months when every month has settled', async () => {
    await render(<MetricsChart data={[settled]} settleDays={67} />);
    await chartDrawn();

    await expect.element(page.getByText(/counted by the month their letter/)).toBeVisible();
    expect(document.body.textContent).not.toContain('provisional');
    expect(document.querySelectorAll('circle[data-provisional]').length).toBe(0);
  });
});
