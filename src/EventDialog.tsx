import { useEffect, useRef, useState } from 'react'
import CalendarSelect from './CalendarSelect.tsx'
import EventTimingFields from './EventTimingFields.tsx'
import type { EventFields, Repeat } from './events.ts'
import type { Calendar } from './ics.ts'

type Props = {
  date: Date
  calendars: Calendar[]
  defaultCalendar: string // file name
  onSave: (fields: EventFields) => void
  onClose: () => void
}

function EventDialog({ date, calendars, defaultCalendar, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [calendar, setCalendar] = useState(defaultCalendar)
  const [startTime, setStartTime] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('none')

  // showModal() gives us the backdrop, focus handling, and Escape-to-close for free.
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onSave({
      title: trimmed,
      description: description.trim(),
      calendar,
      startTime,
      repeat,
    })
  }

  return (
    <dialog
      ref={ref}
      className="event-dialog"
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) ref.current.close()
      }}
    >
      <form onSubmit={save}>
        <h2>New event</h2>
        <p className="event-dialog-date">
          {date.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </label>
        <EventTimingFields
          startTime={startTime}
          repeat={repeat}
          onStartTimeChange={setStartTime}
          onRepeatChange={setRepeat}
        />
        <CalendarSelect calendars={calendars} value={calendar} onChange={setCalendar} />
        <div className="event-dialog-actions">
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default EventDialog
