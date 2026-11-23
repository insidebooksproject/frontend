import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { PackageHeader } from './PackageHeader';
import type { Package, PackageInmate } from '@/types';

function makePackage(inmate: Partial<PackageInmate> = {}): Package {
  return {
    request: {
      index: 2,
      code: 'TEX-1234567-2',
      date_processed: '2026-11-03',
      date_postmarked: '2026-10-28',
      action: 'Filled',
      contents_revision: 1,
    },
    inmate: {
      jurisdiction: 'Texas',
      id: 1234567,
      first_name: 'John',
      last_name: 'Doe',
      race: null,
      sex: 'M',
      release: null,
      url: null,
      unit: null,
      ...inmate,
    },
    items: [],
    warnings: {},
  };
}

describe('PackageHeader', () => {
  it('shows stated pronouns in parentheses after the name', async () => {
    await render(<PackageHeader pkg={makePackage({ pronouns: 'she/her' })} />);

    await expect
      .element(page.getByRole('heading', { level: 1 }))
      .toHaveTextContent('John Doe(she/her)');
    await expect.element(page.getByText('(she/her)')).toHaveClass('text-muted-foreground');
  });

  it('shows nothing after the name when none are recorded', async () => {
    const screen = await render(<PackageHeader pkg={makePackage({ pronouns: null })} />);

    await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(/^John Doe$/);
    expect(screen.container.textContent).not.toContain('(');
  });

  it('shows nothing after the name when the field is absent', async () => {
    await render(<PackageHeader pkg={makePackage()} />);

    await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(/^John Doe$/);
  });
});
