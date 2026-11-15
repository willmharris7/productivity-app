import { useEffect, useRef, useState } from 'react'
import CalendarSelect from './CalendarSelect.tsx'
import EventTimingFields from './EventTimingFields.tsx'
import {
  REPEAT_LABELS,
  formatTime,
  type EventFields,
  type Repeat,
} from './events.ts'
import type { Calendar } from './ics.ts'

type Props = {
  calendars: Calendar[]
  title: string
  description: string
  calendar: string // file name
  startTime: string
  repeat: Repeat
  date: Date | null
  onSave: (fields: EventFields) => void
  onDelete: () => void
  onClose: () => void
}

function EventDetailsDialog({
  calendars,
  title,
  description,
  calendar,
  startTime,
  repeat,
  date,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftDescription, setDraftDescription] = useState(description)
  const [draftCalendar, setDraftCalendar] = useState(calendar)
  const [draftStartTime, setDraftStartTime] = useState(startTime)
  const [draftRepeat, setDraftRepeat] = useState<Repeat>(repeat)

  // showModal() gives us the backdrop, focus handling, and Escape-to-close for free.
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const startEditing = () => {
    setDraftTitle(title)
    setDraftDescription(description)
    setDraftCalendar(calendar)
    setDraftStartTime(startTime)
    setDraftRepeat(repeat)
    setEditing(true)
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    onSave({
      title: trimmed,
      description: draftDescription.trim(),
      calendar: draftCalendar,
      startTime: draftStartTime,
      repeat: draftRepeat,
    })
    setEditing(false)
  }

  const calendarInfo = calendars.find((c) => c.file === calendar)

  const dateLine = date && (
    <p className="event-dialog-date">
      {date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}
    </p>
  )

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
      {editing ? (
        <form onSubmit={save}>
          <h2>Edit event</h2>
          {dateLine}
          <label>
            Title
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Description
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={4}
            />
          </label>
          <EventTimingFields
            startTime={draftStartTime}
            repeat={draftRepeat}
            onStartTimeChange={setDraftStartTime}
            onRepeatChange={setDraftRepeat}
            showCustom={repeat === 'custom'}
          />
          <CalendarSelect
            calendars={calendars}
            value={draftCalendar}
            onChange={setDraftCalendar}
          />
          <div className="event-dialog-actions">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!draftTitle.trim()}
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="event-dialog-body">
          <h2>{title}</h2>
          {dateLine}
          <p className="event-dialog-date">
            {startTime ? formatTime(startTime) : 'All day'}
            {repeat === 'custom'
              ? ' · Repeats on a custom schedule'
              : repeat !== 'none' && ` · Repeats ${REPEAT_LABELS[repeat].toLowerCase()}`}
          </p>
          <p className="event-dialog-calendar">
            <span
              className="calendar-swatch"
              style={{ background: calendarInfo?.color }}
            />
            {calendarInfo?.name ?? calendar}
          </p>
          {description ? (
            <p className="event-dialog-description">{description}</p>
          ) : (
            <p className="event-dialog-description empty">No description</p>
          )}
          <div className="event-dialog-actions">
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
            <button type="button" onClick={startEditing}>
              Edit
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => ref.current?.close()}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}

export default EventDetailsDialog
