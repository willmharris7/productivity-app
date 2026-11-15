import type { Calendar } from './ics.ts'

type Props = {
  calendars: Calendar[]
  value: string // the calendar's file name
  onChange: (value: string) => void
}

// Calendar drop-down shared by the create and edit event forms; one option per .ics file.
function CalendarSelect({ calendars, value, onChange }: Props) {
  return (
    <label>
      Calendar
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {calendars.map((calendar) => (
          <option key={calendar.file} value={calendar.file} disabled={!!calendar.error}>
            {calendar.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export default CalendarSelect
