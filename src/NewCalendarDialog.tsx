import { useEffect, useRef, useState } from 'react'

type Props = {
  initialColor: string
  error: string | null
  onSave: (name: string, color: string) => void
  onClose: () => void
}

// Asks for a new calendar's name and color; saving creates "<name>.ics" in the ics folder in Google Drive.
function NewCalendarDialog({ initialColor, error, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(initialColor)

  // showModal() gives us the backdrop, focus handling, and Escape-to-close for free.
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSave(trimmed, color)
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
        <h2>New calendar</h2>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="calendar-color-field">
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        {error && <p className="event-dialog-error">{error}</p>}
        <div className="event-dialog-actions">
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default NewCalendarDialog
