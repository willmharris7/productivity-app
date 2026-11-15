import NotesTextarea from './NotesTextarea.tsx'
import useMdFile from './useMdFile.ts'

type Props = {
  notesOpen: boolean // whether the Notes screen fills the main area
  onNotesClick: () => void
}

// The Tasks section: the text of md/Tasks/Tasks.md in Google Drive (see useMdFile for saving).
function Tasks({ notesOpen, onNotesClick }: Props) {
  const { text, setText, error } = useMdFile('Tasks/Tasks.md')

  return (
    <section className="tasks">
      <div className="tasks-header">
        <h2>Tasks</h2>
        <button
          type="button"
          className={`back-button${notesOpen ? ' active' : ''}`}
          aria-pressed={notesOpen}
          onClick={onNotesClick}
        >
          Notes
        </button>
      </div>
      {error && <p className="md-file-error">{error}</p>}
      {text !== null && (
        <NotesTextarea
          className="tasks-text"
          value={text}
          onChange={setText}
          placeholder="Click to write… (start a line with - for a bullet)"
        />
      )}
    </section>
  )
}

export default Tasks
