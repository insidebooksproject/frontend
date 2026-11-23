import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { BrowserRouter } from 'react-router-dom';
import { InmateProfile } from './InmateProfile';
import type { Inmate } from '@/types';

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

const mockInmate: Inmate = {
  jurisdiction: 'Texas',
  id: 12345,
  first_name: 'John',
  last_name: 'Doe',
  race: 'White',
  sex: 'M',
  release: '2025-12-24',
  url: 'https://example.com/inmate/12345',
  datetime_fetched: '2024-12-20T10:00:00Z',
  unit: {
    jurisdiction: 'Texas',
    name: 'Test Unit',
    street1: '123 Main St',
    street2: null,
    city: 'Austin',
    state: 'TX',
    zipcode: '78701',
    url: null,
    shipping_method: 'Box',
  },
  requests: [],
  comments: [],
  lookups: [
    { datetime_created: '2024-12-20T09:00:00Z' },
    { datetime_created: '2024-12-19T14:30:00Z' },
  ],
};

describe('InmateProfile', () => {
  it('should display basic inmate information', async () => {
    await renderWithRouter(<InmateProfile inmate={mockInmate} />);

    const name = page.getByText('John Doe');
    await expect.element(name).toBeInTheDocument();

    const id = page.getByText('00012345');
    await expect.element(id).toBeInTheDocument();

    const unit = page.getByText(/test unit/i);
    await expect.element(unit).toBeInTheDocument();

    const race = page.getByText('White');
    await expect.element(race).toBeInTheDocument();

    const sex = page.getByText('M', { exact: true });
    await expect.element(sex).toBeInTheDocument();
  });

  it('should display release date when valid', async () => {
    await renderWithRouter(<InmateProfile inmate={mockInmate} />);

    // Should display December 24, 2025 (not Dec 23 due to timezone shift)
    const releaseDate = page.getByText('2025-12-24');
    await expect.element(releaseDate).toBeInTheDocument();
  });

  it('should display raw release value when not a valid date', async () => {
    const inmateWithInvalidDate = {
      ...mockInmate,
      release: 'LIFE',
    };

    await renderWithRouter(<InmateProfile inmate={inmateWithInvalidDate} />);

    const release = page.getByText('LIFE');
    await expect.element(release).toBeInTheDocument();
  });

  it('should display data last updated', async () => {
    await renderWithRouter(<InmateProfile inmate={mockInmate} />);

    const verifiedLabel = page.getByText('Date verified:');
    await expect.element(verifiedLabel).toBeInTheDocument();

    const verified = page.getByText('2024-12-20', { exact: true });
    await expect.element(verified).toBeInTheDocument();
  });

  it('should display recent lookups', async () => {
    await renderWithRouter(<InmateProfile inmate={mockInmate} />);

    const lookupHeader = page.getByText('Lookups:');
    await expect.element(lookupHeader).toBeInTheDocument();

    // Should show formatted dates
    const lookup1 = page.getByText(/^2024-12-20 at \d\d:\d\d$/);
    await expect.element(lookup1).toBeInTheDocument();

    const lookup2 = page.getByText(/^2024-12-19 at \d\d:\d\d$/);
    await expect.element(lookup2).toBeInTheDocument();
  });

  it('should link inmate name to official record when url is provided', async () => {
    await renderWithRouter(<InmateProfile inmate={mockInmate} />);

    const nameLink = page.getByRole('link', { name: 'John Doe' });
    const element = await nameLink.query();
    expect(element?.getAttribute('href')).toBe('https://example.com/inmate/12345');
    expect(element?.getAttribute('target')).toBe('_blank');
    expect(element?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('should display name as text when url is not provided', async () => {
    const inmateWithoutUrl = {
      ...mockInmate,
      url: null,
    };

    await renderWithRouter(<InmateProfile inmate={inmateWithoutUrl} />);

    const name = page.getByText('John Doe');
    await expect.element(name).toBeInTheDocument();

    const nameLink = page.getByRole('link', { name: 'John Doe' });
    expect(await nameLink.query()).toBeNull();
  });

  it('should link unit name to unit detail page', async () => {
    await renderWithRouter(<InmateProfile inmate={mockInmate} />);

    const unitLink = page.getByRole('link', { name: /test unit/i });
    const element = await unitLink.query();
    expect(element?.getAttribute('href')).toBe('/units/Texas/Test%20Unit');
  });

  it('should show "Not Available" when the inmate has no unit', async () => {
    await renderWithRouter(<InmateProfile inmate={{ ...mockInmate, unit: null }} />);

    const unit = page.getByRole('definition').filter({ hasText: 'Not Available' });
    await expect.element(unit).toBeInTheDocument();
  });

  it('should show "Not Available" for optional fields that are null', async () => {
    const inmateWithoutOptionals = {
      ...mockInmate,
      race: null,
      sex: null,
      release: null,
    };

    await renderWithRouter(<InmateProfile inmate={inmateWithoutOptionals} />);

    const notAvailable = page.getByText('Not Available');
    await expect.element(notAvailable.nth(2)).toBeInTheDocument();
    expect(notAvailable.all()).toHaveLength(3);
  });

  it('should parse date-only strings as local dates (not UTC) to prevent timezone shift', async () => {
    // Regression test for timezone bug where date-only strings were parsed as UTC
    // The bug: new Date("2025-12-24") parses as UTC midnight, which in negative
    // UTC offset timezones (like CST UTC-6) displays as Dec 23
    const inmateWithDateOnlyRelease = {
      ...mockInmate,
      release: '2025-12-24', // Date-only string (no time component)
    };

    await renderWithRouter(<InmateProfile inmate={inmateWithDateOnlyRelease} />);

    // Verify release date displays as Dec 24, not Dec 23
    const releaseDate = page.getByText('2025-12-24');
    await expect.element(releaseDate).toBeInTheDocument();
  });

  it('should correctly parse datetime strings with timezone info', async () => {
    // parseDate helper should handle both date-only and datetime strings
    const inmateWithDatetime = {
      ...mockInmate,
      datetime_fetched: '2024-12-20T10:00:00Z', // Datetime with timezone
    };

    await renderWithRouter(<InmateProfile inmate={inmateWithDatetime} />);

    // Should display the verified date
    const verified = page.getByText('2024-12-20', { exact: true });
    await expect.element(verified).toBeInTheDocument();
  });

  describe('pronouns', () => {
    const withPronouns: Inmate = {
      ...mockInmate,
      pronouns: 'they/them',
      pronouns_set_by: 'QZ',
      pronouns_set_at: '2026-11-23T12:00:00+00:00',
    };

    function labels(container: HTMLElement): string[] {
      return Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent ?? '');
    }

    it('shows no row and no placeholder when none are recorded', async () => {
      const screen = await renderWithRouter(
        <InmateProfile inmate={{ ...mockInmate, pronouns: null }} />
      );

      await expect.element(page.getByText('John Doe')).toBeInTheDocument();
      expect(labels(screen.container)).not.toContain('Pronouns:');
      expect(screen.container.textContent).not.toMatch(/pronoun/i);
    });

    it('offers only a "Record pronouns from a letter" action when none are recorded', async () => {
      const onEditPronouns = vi.fn();
      const screen = await renderWithRouter(
        <InmateProfile inmate={mockInmate} onEditPronouns={onEditPronouns} />
      );

      const record = page.getByRole('button', { name: 'Record pronouns from a letter' });
      await expect.element(record).toBeInTheDocument();
      expect(labels(screen.container)).not.toContain('Pronouns:');

      await record.click();
      expect(onEditPronouns).toHaveBeenCalledOnce();
    });

    it('shows a Pronouns row directly after the name, with who recorded it and when', async () => {
      const screen = await renderWithRouter(<InmateProfile inmate={withPronouns} />);

      const value = page.getByText('they/them');
      await expect.element(value).toBeInTheDocument();
      await expect.element(value).toHaveAttribute('title', 'Recorded by QZ on 2026-11-23');

      const rows = labels(screen.container);
      expect(rows.indexOf('Pronouns:')).toBe(rows.indexOf('Name:') + 1);
      // Not offered as a value to record, and read-only without a handler.
      await expect
        .element(page.getByRole('button', { name: /record pronouns/i }))
        .not.toBeInTheDocument();
      await expect.element(page.getByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });

    it('offers a small Edit control when set', async () => {
      const onEditPronouns = vi.fn();
      await renderWithRouter(
        <InmateProfile inmate={withPronouns} onEditPronouns={onEditPronouns} />
      );

      await page.getByRole('button', { name: 'Edit pronouns' }).click();
      expect(onEditPronouns).toHaveBeenCalledOnce();
    });
  });
});
