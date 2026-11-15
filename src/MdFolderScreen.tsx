import { useState } from 'react'
import NotesTextarea from './NotesTextarea.tsx'
import useMdFile from './useMdFile.ts'
import { listFiles } from './drive.ts'

type MdNote = {
  name: string // file name without .md
  file: string // path inside md, e.g. 'Projects/Code/Docker.md'
  folder: string[] // subfolders below the page's folder, e.g. ['Code']
}

type Props = {
  title: string // also the folder's name inside md
}

const sameFolder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((part, i) => part === b[i])

// A page showing the .md files in one md folder in Google Drive as bubbles (styled like the old
// Projects page): subfolders are folder bubbles, files are note bubbles. Clicking a note
// opens it in the editor, saved back into the file (see useMdFile). Folders only appear
// if they contain a .md file somewhere inside.
function MdFolderScreen({ title }: Props) {
  const notes: MdNote[] = listFiles(`md/${title}`, '.md').map((path) => {
    const file = path.slice('md/'.length)
    const parts = file.split('/').slice(1) // drop the page's own folder
    const name = parts.pop()!.replace(/\.md$/i, '')
    return { name, file, folder: parts }
  })
  // Subfolder being viewed ([] = top level) and the open note, if any.
  const [folder, setFolder] = useState<string[]>([])
  const [openFile, setOpenFile] = useState<string | null>(null)
  const open = notes.find((note) => note.file === openFile)

  if (open) {
    return <MdNoteEditor key={open.file} note={open} onBack={() => setOpenFile(null)} />
  }

  // Notes first, then folders, each alphabetical.
  const here = notes
    .filter((note) => sameFolder(note.folder, folder))
    .sort((a, b) => a.name.localeCompare(b.name))
  const subfolders = [
    ...new Set(
      notes
        .filter(
          (note) =>
            note.folder.length > folder.length &&
            sameFolder(note.folder.slice(0, folder.length), folder),
        )
        .map((note) => note.folder[folder.length]),
    ),
  ].sort((a, b) => a.localeCompare(b))

  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        {folder.length > 0 && (
          <button
            type="button"
            className="back-button"
            onClick={() => setFolder(folder.slice(0, -1))}
          >
            ← Back
          </button>
        )}
        <h2>{folder.length > 0 ? folder[folder.length - 1] : title}</h2>
      </div>
      {notes.length === 0 && (
        <p className="library-message">No .md files in md/{title}.</p>
      )}
      <div className="project-bubbles">
        {here.map((note) => (
          <button
            key={note.file}
            type="button"
            className="project-bubble note"
            onClick={() => setOpenFile(note.file)}
          >
            <span className="project-bubble-icon" aria-hidden="true">
              📝
            </span>
            {note.name}
          </button>
        ))}
        {subfolders.map((name) => (
          <button
            key={name}
            type="button"
            className="project-bubble folder"
            onClick={() => setFolder([...folder, name])}
          >
            <span className="project-bubble-icon" aria-hidden="true">
              📁
            </span>
            {name}
          </button>
        ))}
      </div>
    </section>
  )
}

function MdNoteEditor({ note, onBack }: { note: MdNote; onBack: () => void }) {
  const { text, setText, error } = useMdFile(note.file)

  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2>{note.name}</h2>
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

export default MdFolderScreen
