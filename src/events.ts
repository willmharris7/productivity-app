// 'custom' is any other rule found in an .ics file (every 2 weeks, until a date, ...);
// the forms only offer it for events that already have one, and leave it untouched.
export type Repeat = 'none' | 'weekly' | 'monthly' | 'custom'

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: 'Does not repeat',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom (as in the file)',
}

// What the create/edit forms collect.
export type EventFields = {
  title: string
  description: string
  calendar: string // the calendar's .ics file name
  startTime: string // 'HH:MM', or '' for an all-day event
  repeat: Repeat
}

// Local-time YYYY-MM-DD, matching the dateStr FullCalendar gives for month-view clicks.
export function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// '14:30' -> e.g. '2:30 PM' in the user's locale.
export function formatTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
