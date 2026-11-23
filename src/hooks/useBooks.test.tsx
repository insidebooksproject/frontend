import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { createWrapper } from '@/test/utils';
import { getBookSuggestion } from '@/lib/api/books';
import { bookSuggestionQueryKey, useBookSuggestion } from './useBooks';

vi.mock('@/lib/api/books');

function Suggestion({ title, author }: { title: string; author: string }) {
  const { data, isFetching } = useBookSuggestion(title, author, true);
  return (
    <div data-testid={`${title}|${author}`}>
      {isFetching ? 'fetching' : data ? `${data.title} by ${data.author}` : 'none'}
    </div>
  );
}

describe('useBookSuggestion', () => {
  beforeEach(() => {
    vi.mocked(getBookSuggestion).mockReset();
  });

  it('keys by the cleaned, case-folded text', () => {
    expect(bookSuggestionQueryKey('  Moby  Dik ', 'HERMAN Melvile')).toEqual(
      bookSuggestionQueryKey('moby dik', 'herman melvile')
    );
  });

  it('asks once for the same text in another case, sending it cleaned', async () => {
    vi.mocked(getBookSuggestion).mockResolvedValue({
      title: 'Moby-Dick',
      author: 'Herman Melville',
      confidence: 'high',
      notes: '',
    });
    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <Suggestion title=" Moby  Dik" author="Herman Melvile" />
        <Suggestion title="moby dik" author="herman melvile" />
      </Wrapper>
    );

    await expect
      .element(page.getByTestId('moby dik|herman melvile'))
      .toHaveTextContent('Moby-Dick by Herman Melville');
    expect(getBookSuggestion).toHaveBeenCalledTimes(1);
    expect(getBookSuggestion).toHaveBeenCalledWith('Moby Dik', 'Herman Melvile');
  });

  it('asks nothing for text the portal would refuse', async () => {
    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <Suggestion title="Mo" author="Herman Melvile" />
      </Wrapper>
    );
    await expect.element(page.getByTestId('Mo|Herman Melvile')).toHaveTextContent('none');
    expect(getBookSuggestion).not.toHaveBeenCalled();
  });

  it('drops a suggestion the portal would refuse', async () => {
    vi.mocked(getBookSuggestion).mockResolvedValue({
      title: 'x'.repeat(101),
      author: 'Herman Melville',
      confidence: 'high',
      notes: '',
    });
    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <Suggestion title="Moby Dik" author="Herman Melvile" />
      </Wrapper>
    );
    await expect.poll(() => getBookSuggestion).toHaveBeenCalled();
    await expect.element(page.getByTestId('Moby Dik|Herman Melvile')).toHaveTextContent('none');
  });
});
