// ClickHouse error messages echo the failing SQL/data (and a build tag), so they can be enormous —
// a query with a 2000-element IN list, or an insert that echoes the rejected data chunk plus a
// per-column dump. For display we trim that noise to the essential message and, as a final
// fallback, hard-cap the length so no surface ever shows a wall of text (DL-034). Pure and safe on
// any string: a non-ClickHouse message is just whitespace-normalised (and capped).

/** Default fallback cap — beyond this we truncate with an ellipsis rather than show the raw dump. */
const MAX_LENGTH = 200;

// Markers that precede ClickHouse's echoed query / data / token lists — we drop everything from the
// first one onward, keeping the human-readable lead.
const NOISE_MARKERS = [
  ' in scope ',
  'while processing query:',
  ': While executing',
  ': While processing',
  ' Expected one of:',
  ' before: ', // parse errors echo the rejected input after this ("...expected ',' before: '<data>'")
  ' Row 1:', // CSV/row column dumps ("Row 1: Column 0, name: id, type: UInt32, ...")
];

/** Condense a raw ClickHouse error to its essential, length-bounded message. */
export function formatClickHouseError(raw: string | undefined | null, maxLength = MAX_LENGTH): string {
  if (typeof raw !== 'string') {
    return 'Unknown error';
  }
  let message = raw.replace(/\s+/g, ' ').trim();
  if (!message) {
    return 'Unknown error';
  }
  // Drop the trailing build tag and the repeated "DB::Exception:" noise.
  message = message
    .replace(/\s*\(version[^)]*\)+\s*$/i, '')
    .replace(/DB::Exception:\s*/g, '')
    .trim();

  // Keep a row pointer (parse errors) that the echo-cut below would otherwise remove.
  const rowPointer = message.match(/\(at row \d+\)/i)?.[0];

  // Cut at the earliest noise marker (echoed query / data / expected-token dump).
  let cut = message.length;
  for (const marker of NOISE_MARKERS) {
    const index = message.indexOf(marker);
    if (index !== -1 && index < cut) {
      cut = index;
    }
  }
  message = message
    .slice(0, cut)
    .trim()
    .replace(/[:.,]\s*$/, '')
    .trim();

  // Re-attach the row pointer if the cut dropped it.
  if (rowPointer && !message.includes(rowPointer)) {
    message = `${message} ${rowPointer}`.trim();
  }

  if (!message) {
    return 'Unknown error';
  }
  // Fallback: never show a wall of text.
  return message.length > maxLength ? `${message.slice(0, maxLength - 1).trimEnd()}…` : message;
}

/** Shorten a message for transient surfaces (toasts) where a long one would cover the screen. */
export function truncateForToast(message: string, max = MAX_LENGTH): string {
  return message.length > max ? `${message.slice(0, max - 1).trimEnd()}…` : message;
}
