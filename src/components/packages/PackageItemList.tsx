import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeading, PanelTitle } from '@/components/ui/panel';
import type { BookSuggestion, Jurisdiction, PackageItem } from '@/types';

/**
 * "Registered" or "Not registered yet", the words volunteers see, with the
 * portal's confirmation number when there is one.
 */
export function RegistrationBadge({ item }: { item: PackageItem }) {
  return item.registered_at ? (
    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-green-800 dark:bg-green-900/40 dark:text-green-200">
      Registered{item.confirmation_number && ` (#${item.confirmation_number})`}
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      Not registered yet
    </span>
  );
}

interface PackageItemListProps {
  items: PackageItem[];
  jurisdiction: Jurisdiction;
  onEdit: (item: PackageItem) => void;
  onDelete: (item: PackageItem) => void;
  /** Codes of the inmate's other requests with the same book, by item id. */
  sentBefore?: Record<number, string[]>;
  /** A better spelling of an item's title and author, by item id; `saving` while it's being taken. */
  spelling?: Record<number, Pick<BookSuggestion, 'title' | 'author'> & { saving: boolean }>;
  /** Take the item's spelling suggestion. */
  onUseSpelling?: (item: PackageItem) => void;
  /** Turn the item's spelling suggestion down. */
  onKeepSpelling?: (item: PackageItem) => void;
}

/**
 * One line under a book's title offering a better spelling. Its buttons
 * leave the focus where it was (the scan input), as the dialog's do.
 */
function SpellingNotice({
  item,
  suggestion,
  onUse,
  onKeep,
}: {
  item: PackageItem;
  suggestion: Pick<BookSuggestion, 'title' | 'author'> & { saving: boolean };
  onUse?: (item: PackageItem) => void;
  onKeep?: (item: PackageItem) => void;
}) {
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div
      role="group"
      aria-label={`Spelling suggestion for ${item.title}`}
      className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal"
    >
      <span className="text-muted-foreground">
        Did you mean “{suggestion.title}” by {suggestion.author}?
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        disabled={suggestion.saving}
        onMouseDown={keepFocus}
        onClick={() => onUse?.(item)}
      >
        Use this
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs"
        disabled={suggestion.saving}
        onMouseDown={keepFocus}
        onClick={() => onKeep?.(item)}
      >
        Keep mine
      </Button>
    </div>
  );
}

/**
 * The books recorded in a package. Only Texas books are registered on the
 * portal, so only they show a status; a registered book is read-only.
 */
export function PackageItemList({
  items,
  jurisdiction,
  onEdit,
  onDelete,
  sentBefore = {},
  spelling = {},
  onUseSpelling,
  onKeepSpelling,
}: PackageItemListProps) {
  const showStatus = jurisdiction === 'Texas';

  return (
    <Panel>
      <PanelHeading>
        <PanelTitle>Books ({items.length})</PanelTitle>
      </PanelHeading>
      <PanelBody>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No books recorded yet. Scan each book's ISBN.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 font-semibold">Title</th>
                <th className="py-2 font-semibold">Author</th>
                <th className="py-2 font-semibold">ISBN</th>
                {showStatus && <th className="py-2 font-semibold">Status</th>}
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-2 font-medium">
                    {item.title}
                    {sentBefore[item.id] && (
                      <span className="ml-2 inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                        Already sent in {sentBefore[item.id].join(', ')}
                      </span>
                    )}
                    {!item.registered_at && (
                      // Present before a suggestion arrives, so it's announced.
                      <div aria-live="polite">
                        {spelling[item.id] && (
                          <SpellingNotice
                            item={item}
                            suggestion={spelling[item.id]}
                            onUse={onUseSpelling}
                            onKeep={onKeepSpelling}
                          />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-2">{item.author}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{item.isbn ?? '—'}</td>
                  {showStatus && (
                    <td className="py-2 pr-2">
                      <RegistrationBadge item={item} />
                    </td>
                  )}
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      {!item.registered_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(item)}
                          aria-label={`Edit ${item.title}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDelete(item)}
                        aria-label={`Delete ${item.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PanelBody>
    </Panel>
  );
}
