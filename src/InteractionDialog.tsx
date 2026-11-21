import { useEffect, useRef, useState } from 'react'
import NotesTextarea from './NotesTextarea.tsx'

// Today's date as YYYY-MM-DD, in local time.
function today() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export type Interaction = { date: string; text: string } // date as YYYY-MM-DD

type Props = {
  initial?: Interaction // the interaction being edited; omitted when adding a new one
  onSave: (interaction: Interaction) => void
  onDelete?: () => void // shows a Delete button when given
  onClose: () => void
}

// Small modal for adding or editing an interaction with a contact: a date picker (starting on
// today for a new one) and a text section, plus Delete when editing.
function InteractionDialog({ initial, onSave, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [date, setDate] = useState(initial?.date ?? today)
  const [text, setText] = useState(initial?.text ?? '')

  useEffect(() => {
    ref.current?.showModal()
  }, [])

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
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (date) onSave({ date, text })
        }}
      >
        <h2>{initial ? 'Interaction' : 'New interaction'}</h2>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            autoFocus={!initial}
          />
        </label>
        <label>
          Text
          <NotesTextarea
            className="interaction-text"
            value={text}
            onChange={setText}
            placeholder="What happened… (start a line with - for a bullet)"
          />
        </label>
        <div className="event-dialog-actions">
          {onDelete && (
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!date}>
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default InteractionDialog
