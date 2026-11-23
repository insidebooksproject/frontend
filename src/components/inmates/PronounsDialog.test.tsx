import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { QueryWrapper } from '@/test/utils';
import { ApiError } from '@/lib/api/client';
import { clearPronouns, setPronouns } from '@/lib/api/pronouns';
import { PronounsDialog } from './PronounsDialog';

// Mock the API layer instead of the hooks
vi.mock('@/lib/api/pronouns');
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const RECORDED = { pronouns: 'she/her', set_by: 'QZ', set_at: '2026-11-23T12:00:00+00:00' };

async function renderDialog(pronouns: string | null = null, onOpenChange = vi.fn()) {
  await render(
    <QueryWrapper>
      <PronounsDialog
        open
        onOpenChange={onOpenChange}
        jurisdiction="Texas"
        inmateId={12345}
        pronouns={pronouns}
      />
    </QueryWrapper>
  );
  return onOpenChange;
}

const radio = (name: string | RegExp) => page.getByRole('radio', { name });
const save = () => page.getByRole('button', { name: 'Save' });
const remove = () => page.getByRole('button', { name: 'Remove' });
const initials = () => page.getByLabelText('Your initials');

describe('PronounsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the title and the stated-only help text', async () => {
    await renderDialog();

    await expect
      .element(page.getByRole('heading', { name: 'Pronouns stated in a letter' }))
      .toBeInTheDocument();
    await expect
      .element(
        page.getByText(
          "Only record pronouns this person wrote in a letter. Don't guess from their name, " +
            "the TDCJ/BOP 'Sex' field, or their unit. If the letter doesn't say, leave this empty."
        )
      )
      .toBeInTheDocument();
  });

  it('checks no choice on first use, whatever the inmate', async () => {
    // The dialog takes no sex (or inmate) at all: there is nothing to infer from.
    await renderDialog(null);

    for (const name of ['he/him', 'she/her', 'they/them', 'Other (as written)']) {
      await expect.element(radio(name)).toBeInTheDocument();
      await expect.element(radio(name)).not.toBeChecked();
    }
    await expect.element(remove()).not.toBeInTheDocument();
  });

  it('keeps Save disabled until a choice and initials are given', async () => {
    await renderDialog();

    await expect.element(save()).toBeDisabled();
    await radio('they/them').click();
    await expect.element(save()).toBeDisabled();
    await initials().fill('  ');
    await expect.element(save()).toBeDisabled();
    await initials().fill('QZ');
    await expect.element(save()).toBeEnabled();
  });

  it('starts with Save disabled when only initials are given', async () => {
    await renderDialog();

    await initials().fill('QZ');
    await expect.element(save()).toBeDisabled();
  });

  it('requires text for Other', async () => {
    await renderDialog();

    await expect.element(page.getByLabelText('As written in the letter')).not.toBeInTheDocument();
    await radio('Other (as written)').click();
    await initials().fill('QZ');
    const other = page.getByLabelText('As written in the letter');
    await expect.element(other).toBeInTheDocument();
    await expect.element(save()).toBeDisabled();

    await other.fill('   ');
    await expect.element(save()).toBeDisabled();
    await other.fill('xe/xem');
    await expect.element(save()).toBeEnabled();
  });

  it('saves a choice with the initials and closes', async () => {
    vi.mocked(setPronouns).mockResolvedValue(RECORDED);
    const onOpenChange = await renderDialog();

    await radio('she/her').click();
    await initials().fill(' QZ ');
    await save().click();

    await expect.poll(() => onOpenChange.mock.calls).toEqual([[false]]);
    expect(setPronouns).toHaveBeenCalledWith('Texas', 12345, { pronouns: 'she/her', set_by: 'QZ' });
    expect(clearPronouns).not.toHaveBeenCalled();
  });

  it('saves Other as written', async () => {
    vi.mocked(setPronouns).mockResolvedValue({ ...RECORDED, pronouns: 'xe/xem' });
    await renderDialog();

    await radio('Other (as written)').click();
    await page.getByLabelText('As written in the letter').fill(' xe/xem ');
    await initials().fill('QZ');
    await save().click();

    await expect
      .poll(() => vi.mocked(setPronouns).mock.calls)
      .toEqual([['Texas', 12345, { pronouns: 'xe/xem', set_by: 'QZ' }]]);
  });

  it('preselects the saved choice when editing', async () => {
    await renderDialog('they/them');

    await expect.element(radio('they/them')).toBeChecked();
    await expect.element(radio('she/her')).not.toBeChecked();
  });

  it('preselects Other with the saved text when editing a written-out value', async () => {
    await renderDialog('xe/xem');

    await expect.element(radio('Other (as written)')).toBeChecked();
    await expect.element(page.getByLabelText('As written in the letter')).toHaveValue('xe/xem');
  });

  it('removes only with initials, through the clear endpoint', async () => {
    vi.mocked(clearPronouns).mockResolvedValue(undefined);
    const onOpenChange = await renderDialog('she/her');

    await expect.element(remove()).toBeDisabled();
    await initials().fill('QZ');
    await expect.element(remove()).toBeEnabled();
    await remove().click();

    await expect.poll(() => onOpenChange.mock.calls).toEqual([[false]]);
    expect(clearPronouns).toHaveBeenCalledWith('Texas', 12345, { set_by: 'QZ' });
    expect(setPronouns).not.toHaveBeenCalled();
  });

  it('shows server validation errors and stays open', async () => {
    vi.mocked(setPronouns).mockRejectedValue(
      new ApiError(
        422,
        JSON.stringify([
          {
            loc: ['body', 'pronouns'],
            msg: "String should match pattern '^[A-Za-z][A-Za-z /,.'-]*$'",
          },
        ])
      )
    );
    const onOpenChange = await renderDialog();

    await radio('Other (as written)').click();
    await page.getByLabelText('As written in the letter').fill('xe/xem 2');
    await initials().fill('QZ');
    await save().click();

    await expect
      .element(page.getByText(/^Pronouns: String should match pattern/))
      .toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows other server errors', async () => {
    vi.mocked(clearPronouns).mockRejectedValue(new ApiError(404, 'Inmate not found.'));
    await renderDialog('she/her');

    await initials().fill('QZ');
    await remove().click();

    await expect.element(page.getByText('Inmate not found.')).toBeInTheDocument();
  });
});
