import NotesTextarea from './NotesTextarea.tsx'
import useMdFile from './useMdFile.ts'

// Free-form notes, shown in the main area in place of the calendar. Opened from the
// Notes button in the Tasks header. The text of md/Notes/notes.md in Google Drive (see
// useMdFile for saving).
function NotesScreen() {
  const { text, setText, error } = useMdFile('Notes/notes.md')

  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        <h2>Notes</h2>
      </div>
      {error && <p className="md-file-error">{error}</p>}
      {text !== null && (
        <NotesTextarea
          className="project-editor"
          value={text}
          onChange={setText}
          placeholder="Start writing… (start a line with - for a bullet)"
        />
      )}
    </section>
  )
}

export default NotesScreen
