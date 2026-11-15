import { useEffect, useRef, useState } from 'react'

type Props = {
  title: string
  initialName?: string
  saveLabel?: string
  onSave: (name: string) => void
  onDelete?: () => void // shows a Delete button when given
  onClose: () => void
}

// Small modal that asks for a name (creating, renaming or deleting folders and notes).
function NameDialog({
  title,
  initialName = '',
  saveLabel = 'Create',
  onSave,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(initialName)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSave(trimmed)
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
        <h2>{title}</h2>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
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
          <button type="submit" className="primary" disabled={!name.trim()}>
            {saveLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default NameDialog
