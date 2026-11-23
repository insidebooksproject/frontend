import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  bookSuggestionQueryKey,
  canSuggestFor,
  useBookSuggestion,
  useLookupBook,
  useLookupUpc,
} from '@/hooks/useBooks';
import { ApiError, getValidationErrors } from '@/lib/api';
import { classifyBarcode, isBareUpc, NOT_A_BARCODE, type BookBarcode } from '@/lib/barcode';
import {
  cleanPortalText,
  isPortalLength,
  PORTAL_LENGTH_MESSAGE,
  PORTAL_MAX_LENGTH,
} from '@/lib/portalText';
import type { Book, ItemSource } from '@/types';
import { SuggestionSlot, type Suggestion } from './SuggestionSlot';

const BARCODE_HELP =
  "Scan the book's barcode, or type the number under it. An ISBN (starts 978 or 979; also inside the front cover) is best. IBP remembers this book, so the next copy fills in by itself.";
const BARE_UPC =
  "This UPC is shared by many books, so it can't identify this one. Look for an ISBN inside the front cover, or leave this empty.";

// A barcode scanner types its digits a few ms apart and ends with Enter
// (the Book Portal extension tells scans from typing the same way). Nobody
// types SCAN_MIN_KEYS keys that fast. What it sends is an EAN-13 (an ISBN,
// maybe with its price add-on) or a UPC: 12 digits or more, never an ISBN-10.
const SCAN_GAP_MS = 50;
const SCAN_MIN_KEYS = 6;
const SCAN_MIN_DIGITS = 12;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']);

// A typed title and author are looked up for a better spelling once the
// volunteer pauses this long (or leaves Author).
export const SPELLING_PAUSE_MS = 600;

const itemSchema = z.object({
  barcode: z
    .string()
    .refine((value) => !value.trim() || classifyBarcode(value, { scanned: true }) !== null, {
      message: NOT_A_BARCODE,
    }),
  title: z.string().refine(isPortalLength, { message: PORTAL_LENGTH_MESSAGE }),
  author: z.string().refine(isPortalLength, { message: PORTAL_LENGTH_MESSAGE }),
  updateCache: z.boolean(),
  rememberBook: z.boolean(),
});

export type ItemFormValues = z.infer<typeof itemSchema>;

type ItemField = 'barcode' | 'title' | 'author';
const ITEM_FIELDS: ItemField[] = ['barcode', 'title', 'author'];

/**
 * What looking up the barcode found. `code` is what was looked up: the
 * ISBN-13, or the UPC code (with its add-on). A UPC IBP maps to an ISBN it
 * has no title for is `not_found` with that `isbn`.
 */
export type BarcodeLookup =
  | { code: string; status: 'pending' }
  | { code: string; status: 'found'; book: Book }
  | { code: string; status: 'not_found'; isbn?: string }
  | { code: string; status: 'failed'; message: string };

/** The book to save, as the form worked it out. */
export interface ItemFormResult {
  /** The ISBN-13: the barcode's, or the one its UPC maps to. */
  isbn: string | null;
  /** A UPC code (with its add-on) scanned for the book, to remember for its ISBN. */
  upc: string | null;
  title: string;
  author: string;
  /** `isbn` when the title and author are the lookup's, as a scan would save them. */
  source: ItemSource;
  /** Add only: remember the typed title and author for the ISBN's next scan. */
  rememberBook: boolean;
  /** Edit only: "Fix this title for all future scans". */
  updateCache: boolean;
  /**
   * Look the saved title and author up for a better spelling after saving:
   * the form may, but none was shown or turned down for them.
   */
  checkSpelling: boolean;
}

export interface ItemFormDialogProps {
  open: boolean;
  /** Called with false when the volunteer cancels or closes the dialog. */
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  defaultValues: ItemFormValues;
  /** The lookup already made for the default barcode (a scan's), if any. */
  initialLookup?: BarcodeLookup;
  /** Why the form opened, e.g. "No book found for this ISBN." */
  note?: string;
  /** Errors to show from the start (e.g. the lookup's "Not a valid ISBN."). */
  initialErrors?: Partial<Record<ItemField, string>>;
  /** Show the prefilled title and author's errors from the start. */
  validateOnOpen?: boolean;
  /**
   * Offer a better spelling of a typed title and author (never for a book
   * registered on the portal).
   */
  suggestSpelling?: boolean;
  /** The default title and author are a lookup's: no spelling is offered for them as they are. */
  defaultsLookedUp?: boolean;
  /**
   * Save the item. A thrown 422 is shown on its fields; any other error is
   * shown above the buttons. The caller closes the dialog.
   */
  onSubmit: (values: ItemFormResult) => Promise<void>;
  /** Where the focus goes when the dialog closes. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** The dialog to type in a book (manual add) or edit one. */
export function ItemFormDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: ItemFormDialogProps) {
  // While saving, the dialog can't be dismissed (Cancel, Escape, a click
  // outside, the close button): the save's outcome belongs to this form.
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => (next || !saving) && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!saving}
        // The form focuses the field that needs typing.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{props.mode === 'add' ? 'Add a book' : 'Edit book'}</DialogTitle>
          <DialogDescription>
            {props.note ??
              (props.mode === 'add'
                ? 'Type the title and author as they appear on the book.'
                : 'Correct the title, author or barcode number.')}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from its defaults. */}
        <ItemForm {...props} onCancel={() => onOpenChange(false)} onSavingChange={setSaving} />
      </DialogContent>
    </Dialog>
  );
}

function lookupKey(code: BookBarcode): string {
  return code.kind === 'isbn' ? code.isbn : code.code;
}

/** The ISBN a barcode gives the book: its own, or the one its UPC maps to. */
function barcodeIsbn(code: BookBarcode | null, lookup: BarcodeLookup | null): string | null {
  if (!code) return null;
  if (code.kind === 'isbn') return code.isbn;
  if (isBareUpc(code)) return null;
  if (lookup?.status === 'found') return lookup.book.isbn;
  if (lookup?.status === 'not_found') return lookup.isbn ?? null;
  return null;
}

function itemSource(
  title: string,
  author: string,
  isbn: string | null,
  lookup: BarcodeLookup | null
): ItemSource {
  if (lookup?.status !== 'found' || !isbn || lookup.book.isbn !== isbn) return 'manual';
  const { book } = lookup;
  if (title !== cleanPortalText(book.title)) return 'manual';
  if (book.author?.trim() && author !== cleanPortalText(book.author)) return 'manual';
  return 'isbn';
}

/** A title and author as compared for spelling suggestions (cleaned, case-folded). */
function textKey(title: string, author: string): string {
  return bookSuggestionQueryKey(title, author).join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The code a scanner just typed into a field holding `value`, given the
 * `burst` of fast keys before its Enter: the digits ending the field (a busy
 * browser can split one scan into two bursts), else the burst alone (a scan
 * typed after an earlier one, or in the middle of the text). Null if neither
 * is a code a scanner sends.
 */
function scannedCode(value: string, burst: string): string | null {
  const trailing = /\d+$/.exec(value.trimEnd())?.[0] ?? '';
  for (const candidate of [trailing, burst]) {
    const digitsOnly = /^\d+$/.test(candidate) && candidate.length >= SCAN_MIN_DIGITS;
    if (digitsOnly && classifyBarcode(candidate, { scanned: true })) return candidate;
  }
  return null;
}

/** `value` without the scanned digits typed into it (normally at its end). */
function withoutScan(value: string, scanned: string): string {
  const at = value.lastIndexOf(scanned);
  return at < 0 ? value : value.slice(0, at) + value.slice(at + scanned.length);
}

interface KeyStroke {
  key: string;
  time: number;
  target: EventTarget;
}

function ItemForm({
  mode,
  defaultValues,
  initialLookup,
  initialErrors,
  validateOnOpen,
  suggestSpelling = false,
  defaultsLookedUp = false,
  onSubmit,
  onCancel,
  onSavingChange,
}: Omit<ItemFormDialogProps, 'open' | 'onOpenChange' | 'onCloseAutoFocus' | 'note'> & {
  onCancel: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    setError,
    setFocus,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues,
    mode: 'onTouched',
  });
  const lookupBook = useLookupBook();
  const lookupUpc = useLookupUpc();

  const [lookup, setLookupState] = useState<BarcodeLookup | null>(initialLookup ?? null);
  const lookupRef = useRef(lookup);
  const setLookup = (next: BarcodeLookup | null) => {
    lookupRef.current = next;
    setLookupState(next);
  };
  // The lookup whose title and author are in the form already, or were
  // turned down: its suggestion isn't offered (again).
  const [settled, setSettled] = useState<string | null>(
    initialLookup?.status === 'found' ? initialLookup.code : null
  );
  // A UPC (with its add-on) IBP had no ISBN for: once the volunteer finds
  // the ISBN, saving remembers it for this UPC.
  const [upcForIsbn, setUpcForIsbn] = useState<string | null>(() => {
    const code = classifyBarcode(defaultValues.barcode, { scanned: true });
    return code?.kind === 'upc' && initialLookup?.status === 'not_found' && !initialLookup.isbn
      ? code.code
      : null;
  });
  // The title and author last looked up for a better spelling.
  const [asked, setAsked] = useState<{ title: string; author: string } | null>(null);
  // Titles and authors (by textKey) not to offer a spelling for: a lookup's,
  // a suggestion taken, or what the volunteer kept.
  const [quiet, setQuiet] = useState<ReadonlySet<string>>(() =>
    defaultsLookedUp || initialLookup?.status === 'found'
      ? new Set([textKey(defaultValues.title, defaultValues.author)])
      : new Set()
  );
  const hush = (title: string, author: string) =>
    setQuiet((current) => new Set(current).add(textKey(title, author)));
  const [initialText] = useState(() => [defaultValues.title, defaultValues.author]);
  // The barcode as a scanner last typed it (a scan is read more leniently).
  const scannedText = useRef<string | null>(defaultValues.barcode.trim() || null);
  const lastLookedUp = useRef(defaultValues.barcode.trim());
  const lookupSeq = useRef(0);
  const strokes = useRef<KeyStroke[]>([]);
  const submitRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Focus now (react-hook-form's setFocus waits a tick, which would land
  // after a lookup that answers at once).
  const focusField = (field: 'title' | 'author') =>
    formRef.current?.querySelector<HTMLInputElement>(`#item-${field}`)?.focus();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => onSavingChange(isSubmitting), [isSubmitting, onSavingChange]);

  // On opening: show the errors already known and focus the first field the
  // packer has to fix or fill (the barcode only when it's what's wrong).
  useEffect(() => {
    for (const field of ITEM_FIELDS) {
      const message = initialErrors?.[field];
      if (message) setError(field, { message });
    }
    if (validateOnOpen) {
      const prefilled = ITEM_FIELDS.filter((field) => field !== 'barcode' && defaultValues[field]);
      if (prefilled.length > 0) void trigger(prefilled);
    }
    const first: ItemField = initialErrors?.barcode
      ? 'barcode'
      : !isPortalLength(defaultValues.title)
        ? 'title'
        : !isPortalLength(defaultValues.author)
          ? 'author'
          : 'title';
    setFocus(first);
    // Only when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [barcode, title, author] = useWatch({ control, name: ['barcode', 'title', 'author'] });

  /** Look up a better spelling of the title and author now in the form. */
  const askAboutTyped = useCallback(() => {
    const [typedTitle, typedAuthor] = getValues(['title', 'author']);
    const next = { title: cleanPortalText(typedTitle), author: cleanPortalText(typedAuthor) };
    setAsked((current) =>
      current?.title === next.title && current.author === next.author ? current : next
    );
  }, [getValues]);

  // Once the volunteer stops typing in Title or Author for a moment.
  useEffect(() => {
    if (!suggestSpelling || (title === initialText[0] && author === initialText[1])) return;
    const timer = setTimeout(askAboutTyped, SPELLING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [title, author, suggestSpelling, initialText, askAboutTyped]);

  const classify = (value: string) =>
    value.trim() ? classifyBarcode(value, { scanned: value.trim() === scannedText.current }) : null;
  const code = classify(barcode ?? '');
  const currentLookup = code && lookup?.code === lookupKey(code) ? lookup : null;
  const isbn = barcodeIsbn(code, currentLookup);
  const showRemember = mode === 'add' && isbn !== null && currentLookup?.status === 'not_found';

  const found = currentLookup?.status === 'found' ? currentLookup : null;
  const suggestion: Suggestion | null =
    found &&
    settled !== found.code &&
    ((title ?? '').trim() || (author ?? '').trim()) &&
    (cleanPortalText(title ?? '') !== cleanPortalText(found.book.title) ||
      cleanPortalText(author ?? '') !== cleanPortalText(found.book.author ?? ''))
      ? {
          title: cleanPortalText(found.book.title),
          author: found.book.author ? cleanPortalText(found.book.author) : null,
        }
      : null;

  // A better spelling, only without a book found for the barcode (a stronger
  // signal than the title, whose offer the slot shows instead), and only for
  // the text as it was looked up: editing drops it.
  const mayCheckSpelling = (checkTitle: string, checkAuthor: string) =>
    suggestSpelling &&
    !found &&
    canSuggestFor(checkTitle, checkAuthor) &&
    !quiet.has(textKey(checkTitle, checkAuthor));
  const askedNow = asked !== null && mayCheckSpelling(asked.title, asked.author);
  const { data: spellingAnswer } = useBookSuggestion(
    asked?.title ?? '',
    asked?.author ?? '',
    askedNow
  );
  const typedKey = textKey(title ?? '', author ?? '');
  const spelling: Suggestion | null =
    !suggestion &&
    askedNow &&
    textKey(asked.title, asked.author) === typedKey &&
    spellingAnswer &&
    textKey(spellingAnswer.title, spellingAnswer.author) !== typedKey
      ? { title: spellingAnswer.title, author: spellingAnswer.author }
      : null;

  /** Fill empty Title and Author from a lookup; true if both are now fine. */
  const fillFrom = (book: Book) => {
    const filled = {
      title: cleanPortalText(book.title),
      author: cleanPortalText(book.author ?? ''),
    };
    for (const field of ['title', 'author'] as const) {
      if (filled[field]) setValue(field, filled[field], { shouldValidate: true });
    }
    const [filledTitle, filledAuthor] = getValues(['title', 'author']);
    hush(filledTitle, filledAuthor);
    return isPortalLength(filled.title) && isPortalLength(filled.author);
  };

  const runLookup = async (raw: string, scanned: boolean) => {
    const text = raw.trim();
    lastLookedUp.current = text;
    const barcodeCode = text ? classifyBarcode(text, { scanned }) : null;
    if (!barcodeCode || isBareUpc(barcodeCode)) return;
    const key = lookupKey(barcodeCode);
    const known = lookupRef.current;
    if (known?.code === key && known.status !== 'failed') return;

    const seq = ++lookupSeq.current;
    setLookup({ code: key, status: 'pending' });
    let result: BarcodeLookup;
    try {
      if (barcodeCode.kind === 'isbn') {
        result = { code: key, status: 'found', book: await lookupBook(barcodeCode.isbn) };
      } else {
        const answer = await lookupUpc(barcodeCode.code);
        result =
          answer.status === 'found'
            ? { code: key, status: 'found', book: answer.book }
            : answer.status === 'no_book'
              ? { code: key, status: 'not_found', isbn: answer.isbn }
              : { code: key, status: 'not_found' };
      }
    } catch (error) {
      result =
        error instanceof ApiError && error.status === 404
          ? { code: key, status: 'not_found' }
          : { code: key, status: 'failed', message: errorMessage(error) };
    }
    if (!alive.current || seq !== lookupSeq.current) return;
    setLookup(result);

    if (result.status === 'not_found' && barcodeCode.kind === 'upc' && !result.isbn) {
      setUpcForIsbn(barcodeCode.code);
    }
    if (result.status !== 'found') return;
    const [typedTitle, typedAuthor] = getValues(['title', 'author']);
    if (typedTitle.trim() || typedAuthor.trim()) return; // offered in the slot instead
    setSettled(key);
    const both = fillFrom(result.book);
    const focused = document.activeElement?.id;
    if (focused === 'item-title' || focused === 'item-barcode') {
      if (both) submitRef.current?.focus();
      else if (!isPortalLength(getValues('author'))) focusField('author');
    }
  };

  /** Put a code in the barcode field (a scan replaces what was there) and look it up. */
  const takeBarcode = (raw: string, scanned: boolean, focusTitle: boolean) => {
    const text = raw.trim();
    scannedText.current = scanned ? text : null;
    setValue('barcode', text, { shouldValidate: true, shouldTouch: true });
    if (text && !classifyBarcode(text, { scanned })) return; // stays, marked
    if (focusTitle) focusField('title');
    void runLookup(text, scanned);
  };

  // Enter in the barcode field takes the code instead of saving. A scan
  // (digits a few ms apart, then Enter) anywhere else in the form goes to
  // the barcode field, never into a title. A typed Enter in Title or Author
  // still saves.
  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (MODIFIER_KEYS.has(e.key)) return;
    // When the key came in, not when it's handled: a slow render between
    // keystrokes mustn't break up a scan.
    const now = e.timeStamp;
    if (e.key !== 'Enter') {
      const last = strokes.current.at(-1);
      const continues =
        e.key.length === 1 && last && now - last.time <= SCAN_GAP_MS && last.target === e.target;
      if (!continues) strokes.current = [];
      if (e.key.length === 1) strokes.current.push({ key: e.key, time: now, target: e.target });
      return;
    }

    const keys = strokes.current;
    strokes.current = [];
    const last = keys.at(-1);
    const burst =
      keys.length >= SCAN_MIN_KEYS && last && now - last.time <= SCAN_GAP_MS
        ? keys.map((stroke) => stroke.key).join('')
        : null;
    const target = e.target as HTMLElement;
    const field =
      target.id === 'item-barcode'
        ? 'barcode'
        : target.id === 'item-title'
          ? 'title'
          : target.id === 'item-author'
            ? 'author'
            : null;
    const value = field ? getValues(field) : '';
    const scan = burst ? scannedCode(value, burst) : null;

    if (field === 'barcode') {
      e.preventDefault();
      if (scan) takeBarcode(scan, true, true);
      else takeBarcode(value, false, true);
      return;
    }
    if (!scan) return;
    e.preventDefault();
    e.stopPropagation();
    if (field) setValue(field, withoutScan(value, scan));
    takeBarcode(scan, true, false);
  };

  const submit = async (values: ItemFormValues) => {
    const barcodeCode = classify(values.barcode);
    const matching =
      barcodeCode && lookupRef.current?.code === lookupKey(barcodeCode) ? lookupRef.current : null;
    const itemIsbn = barcodeIsbn(barcodeCode, matching);
    const upc =
      barcodeCode?.kind === 'upc' && !isBareUpc(barcodeCode)
        ? barcodeCode.code
        : barcodeCode?.kind === 'isbn'
          ? upcForIsbn
          : null;
    const cleanTitle = cleanPortalText(values.title);
    const cleanAuthor = cleanPortalText(values.author);
    try {
      await onSubmit({
        isbn: itemIsbn,
        upc: itemIsbn ? upc : null,
        title: cleanTitle,
        author: cleanAuthor,
        source: itemSource(cleanTitle, cleanAuthor, itemIsbn, matching),
        rememberBook: showRemember && values.rememberBook,
        updateCache: values.updateCache,
        // Saved with a suggestion showing: kept as typed.
        checkSpelling: !spelling && mayCheckSpelling(cleanTitle, cleanAuthor),
      });
    } catch (error) {
      const fieldErrors = getValidationErrors(error);
      const unplaced: string[] = [];
      for (const { field, message } of fieldErrors) {
        const formField = field === 'isbn' || field === 'upc' ? 'barcode' : field;
        if ((ITEM_FIELDS as string[]).includes(formField)) {
          setError(formField as ItemField, { message });
        } else {
          unplaced.push(message);
        }
      }
      if (fieldErrors.length === 0) {
        unplaced.push(
          error instanceof ApiError || error instanceof Error ? error.message : String(error)
        );
      }
      if (unplaced.length > 0) setError('root.server', { message: unplaced.join(' ') });
    }
  };

  const barcodeField = register('barcode', {
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const text = e.target.value.trim();
      if (text !== lastLookedUp.current) void runLookup(text, text === scannedText.current);
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(submit)}
      onKeyDownCapture={onKeyDownCapture}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1">
        <Label htmlFor="item-barcode">Barcode number (optional)</Label>
        <Input
          id="item-barcode"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!errors.barcode}
          aria-describedby="item-barcode-help"
          {...barcodeField}
        />
        <p id="item-barcode-help" className="text-xs text-muted-foreground">
          {BARCODE_HELP}
        </p>
        {/* Room for two lines, so the fields below don't jump as it changes. */}
        <div style={{ minHeight: '2rem' }} aria-live="polite">
          {errors.barcode ? (
            <p className="text-sm text-destructive">{errors.barcode.message}</p>
          ) : (
            <BarcodeStatus code={code} lookup={currentLookup} upcForIsbn={upcForIsbn} />
          )}
        </div>
      </div>

      <TextField
        id="item-title"
        label="Title"
        length={cleanPortalText(title ?? '').length}
        error={errors.title?.message}
        inputProps={register('title')}
      />
      <TextField
        id="item-author"
        label="Author"
        length={cleanPortalText(author ?? '').length}
        error={errors.author?.message}
        inputProps={register('author', {
          onBlur: () => suggestSpelling && askAboutTyped(),
        })}
        help='No author on the book? Type "Unknown".'
      />

      <SuggestionSlot
        label={suggestion ? 'From the barcode' : 'Did you mean:'}
        suggestion={suggestion ?? spelling}
        onUse={() => {
          if (suggestion && found) {
            const looked = {
              title: cleanPortalText(found.book.title),
              author: cleanPortalText(found.book.author ?? ''),
            };
            setValue('title', looked.title, { shouldValidate: true });
            setValue('author', looked.author, { shouldValidate: true });
            setSettled(found.code);
            hush(looked.title, looked.author);
          } else if (spelling) {
            setValue('title', spelling.title, { shouldValidate: true });
            setValue('author', spelling.author ?? '', { shouldValidate: true });
            hush(spelling.title, spelling.author ?? '');
          }
        }}
        onKeep={() => {
          if (suggestion && found) setSettled(found.code);
          else if (spelling) hush(title ?? '', author ?? '');
        }}
      />

      {mode === 'add' && (
        <div className="flex items-center gap-2" style={{ height: '1.25rem' }}>
          {showRemember && (
            <>
              <input
                id="item-remember"
                type="checkbox"
                className="h-4 w-4"
                {...register('rememberBook')}
              />
              <Label htmlFor="item-remember">Remember this book</Label>
            </>
          )}
        </div>
      )}

      {mode === 'edit' && isbn && (
        <div className="flex items-center gap-2">
          <input
            id="item-update-cache"
            type="checkbox"
            className="h-4 w-4"
            {...register('updateCache')}
          />
          <Label htmlFor="item-update-cache">Fix this title for all future scans</Label>
        </div>
      )}

      {errors.root?.server && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          // Keep the field focused: its blur would validate it, and the error
          // appearing moves this button out from under the pointer.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button ref={submitRef} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : mode === 'add' ? 'Add book' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One line on what the barcode is, and a quiet note on its lookup. */
function BarcodeStatus({
  code,
  lookup,
  upcForIsbn,
}: {
  code: BookBarcode | null;
  lookup: BarcodeLookup | null;
  upcForIsbn: string | null;
}) {
  if (!code) return null;
  if (isBareUpc(code)) return <p className="text-xs text-muted-foreground">{BARE_UPC}</p>;

  const upcWithoutIsbn = code.kind === 'upc' && lookup?.status === 'not_found' && !lookup.isbn;
  const what =
    code.kind === 'isbn'
      ? `ISBN ${code.isbn}: the next copy will fill in by itself.`
      : upcWithoutIsbn
        ? "UPC with add-on: IBP can remember it once it has the book's ISBN. Scan or type the ISBN from inside the front cover here."
        : 'UPC with add-on: the next copy will fill in by itself.';
  const note =
    lookup?.status === 'pending'
      ? 'Looking it up...'
      : lookup?.status === 'failed'
        ? "Couldn't look it up; type the title and author."
        : lookup?.status === 'not_found' && !upcWithoutIsbn
          ? "IBP doesn't know this book yet; type the title and author."
          : code.kind === 'isbn' && upcForIsbn
            ? `UPC ${upcForIsbn} is remembered with it.`
            : null;
  return (
    <p className="text-xs text-muted-foreground">
      {what}
      {note && <span className="ml-1 italic">{note}</span>}
    </p>
  );
}

function TextField({
  id,
  label,
  length,
  error,
  inputProps,
  help,
}: {
  id: string;
  label: string;
  length: number;
  error?: string;
  inputProps: React.ComponentProps<'input'>;
  help?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span
          className={`text-xs ${length > PORTAL_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {length}/{PORTAL_MAX_LENGTH}
        </span>
      </div>
      <Input id={id} autoComplete="off" aria-invalid={!!error} {...inputProps} />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        help && <p className="text-xs text-muted-foreground">{help}</p>
      )}
    </div>
  );
}
