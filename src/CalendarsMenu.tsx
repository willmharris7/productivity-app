import { useEffect, useRef } from 'react'
import type { Calendar } from './ics.ts'

type Props = {
  position: { top: number; left: number }
  calendars: Calendar[] // one per .ics file in the ics folder in Google Drive
  hidden: string[] // file names of unticked calendars
  onChange: (hidden: string[]) => void
  onNewCalendar: () => void
  onClose: () => void
}

// Tick boxes for showing or hiding each calendar, plus a button for adding a new one.
// Tracks the hidden calendars, so newly added files show up ticked.
function CalendarsMenu({
  position,
  calendars,
  hidden,
  onChange,
  onNewCalendar,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on Escape or on a click outside the menu (clicks on the Calendars
  // button itself are left to its own toggle handler).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element
      if (ref.current?.contains(target)) return
      if (target.closest('.calendars-button')) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const toggle = (file: string) => {
    onChange(
      hidden.includes(file)
        ? hidden.filter((f) => f !== file)
        : [...hidden, file],
    )
  }

  return (
    <div
      ref={ref}
      className="calendars-menu"
      role="group"
      aria-label="Calendars"
      style={position}
    >
      {calendars.length === 0 && (
        <p className="calendars-menu-empty">No .ics files in the ics folder</p>
      )}
      {calendars.map((calendar) => (
        <label
          key={calendar.file}
          title={calendar.error ? `${calendar.file}: ${calendar.error}` : calendar.file}
          className={calendar.error ? 'calendars-menu-broken' : undefined}
        >
          <input
            type="checkbox"
            checked={!hidden.includes(calendar.file)}
            onChange={() => toggle(calendar.file)}
          />
          <span
            className="calendar-swatch"
            style={{ background: calendar.color }}
          />
          {calendar.name}
          {calendar.error && ' (unreadable)'}
        </label>
      ))}
      <button
        type="button"
        className="calendars-menu-new"
        onClick={onNewCalendar}
      >
        + New calendar…
      </button>
    </div>
  )
}

export default CalendarsMenu
