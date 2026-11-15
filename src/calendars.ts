// Calendars themselves are the .ics files in the ics folder in Google Drive (see ics.ts); this holds the
// defaults around them.

// New events start in the calendar with this name, if there is one.
export const DEFAULT_CALENDAR = 'Confirmed'

// Colors offered for new calendars, and used for files that don't set one.
export const CALENDAR_PALETTE = [
  '#2563eb', // blue
  '#9333ea', // purple
  '#facc15', // yellow
  '#fb923c', // soft orange
  '#16a34a', // green
  '#c0c0c0', // silver
  '#dc2626', // red
  '#0d9488', // teal
  '#db2777', // pink
]

// Text color to draw on top of an event bar of this color: dark on light colors,
// white on dark ones.
export function contrastColor(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.35 ? '#1f2937' : '#fff'
}
