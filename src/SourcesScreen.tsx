import NotesTextarea from './NotesTextarea.tsx'
import useMdFile from './useMdFile.ts'
import { listFiles } from './drive.ts'

// Card order: these first (the page's original order), then any other files alphabetically.
const ORDER = ['General', 'Tech', 'Salsa', 'Film', 'TTRPG', 'Magic', 'Sauna', 'Hiking']
const rank = (name: string) => {
  const i = ORDER.indexOf(name)
  return i === -1 ? ORDER.length : i
}

// The Events page, shown in place of the calendar: one card per .md file in md/Events
// in Google Drive.
function SourcesScreen() {
  const sources = listFiles('md/Events', '.md', false)
    .map((path) => {
      const fileName = path.split('/').pop()!
      return { name: fileName.replace(/\.md$/i, ''), file: `Events/${fileName}` }
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))

  return (
    <section className="sources-screen">
      <div className="sources-screen-header">
        <h2>Events</h2>
      </div>
      {sources.length === 0 && (
        <p className="library-message">No .md files in md/Events.</p>
      )}
      <div className="source-bubbles">
        {sources.map((source) => (
          <SourceCard key={source.file} {...source} />
        ))}
      </div>
    </section>
  )
}

// One card: the text of its .md file (see useMdFile for saving).
function SourceCard({ name, file }: { name: string; file: string }) {
  const { text, setText, error } = useMdFile(file)

  return (
    // The whole card is the label, so clicking anywhere in it focuses the text.
    <label className="source-bubble">
      <span className="source-title">{name}</span>
      {error && <span className="md-file-error">{error}</span>}
      {text !== null && (
        <NotesTextarea
          className="source-notes"
          value={text}
          onChange={setText}
          placeholder="Click to write…"
        />
      )}
    </label>
  )
}

export default SourcesScreen
