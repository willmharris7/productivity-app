import { useState } from 'react'
import NameDialog from './NameDialog.tsx'
import NotesTextarea from './NotesTextarea.tsx'
import useMdFile from './useMdFile.ts'
import { createFolder, exists, listFiles, listFolders, rename, saveText, trash } from './drive.ts'

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
// opens it in the editor, saved back into the file (see useMdFile). Add Folder and Add
// Note create a folder or an empty .md file in Drive, in the folder being viewed. In edit
// mode (the Edit button), clicking a bubble renames it or moves it to the Drive trash.
function MdFolderScreen({ title }: Props) {
  // Bumped after creating, renaming or deleting, to re-read the listing.
  const [, setCreated] = useState(0)
  const notes: MdNote[] = listFiles(`md/${title}`, '.md').map((path) => {
    const file = path.slice('md/'.length)
    const parts = file.split('/').slice(1) // drop the page's own folder
    const name = parts.pop()!.replace(/\.md$/i, '')
    return { name, file, folder: parts }
  })
  // Every folder below the page's folder, empty ones included, as path parts.
  const folders = listFolders(`md/${title}`).map((path) =>
    path.split('/').slice(2), // drop 'md' and the page's own folder
  )
  // Subfolder being viewed ([] = top level) and the open note, if any.
  const [folder, setFolder] = useState<string[]>([])
  const [openFile, setOpenFile] = useState<string | null>(null)
  const open = notes.find((note) => note.file === openFile)
  // Which name dialog is open, and the error from the last create, if any.
  const [adding, setAdding] = useState<'folder' | 'note' | null>(null)
  // What's being changed in Drive right now, shown as a status line.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Edit mode, and the bubble whose rename/delete dialog is open.
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<{ kind: 'folder' | 'note'; name: string } | null>(
    null,
  )

  if (open) {
    return <MdNoteEditor key={open.file} note={open} onBack={() => setOpenFile(null)} />
  }

  // Notes first, then folders, each alphabetical.
  const here = notes
    .filter((note) => sameFolder(note.folder, folder))
    .sort((a, b) => a.name.localeCompare(b.name))
  const subfolders = folders
    .filter(
      (parts) =>
        parts.length === folder.length + 1 && sameFolder(parts.slice(0, folder.length), folder),
    )
    .map((parts) => parts[folder.length])
    .sort((a, b) => a.localeCompare(b))

  // Path in Drive of the folder or note named `name` in the folder being viewed.
  const pathOf = (kind: 'folder' | 'note', name: string) =>
    ['md', title, ...folder, kind === 'note' && !/\.md$/i.test(name) ? `${name}.md` : name].join(
      '/',
    )

  // Runs a Drive change, showing `status` meanwhile and any error after.
  async function run(status: string, change: () => Promise<void>) {
    setError(null)
    setBusy(status)
    try {
      await change()
      setCreated((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const badName = (name: string) =>
    /[/\\]/.test(name) ? 'Names can’t contain / or \\.' : null

  // Creates the folder or note named `name` in the folder being viewed; a new note opens.
  function create(kind: 'folder' | 'note', name: string) {
    setAdding(null)
    const path = pathOf(kind, name)
    const problem =
      badName(name) ??
      (exists(path) ? `There's already a ${kind} named ${name} here.` : null)
    if (problem) return setError(problem)
    run('Creating in Google Drive…', async () => {
      if (kind === 'folder') await createFolder(path)
      else {
        await saveText(path, null, '')
        setOpenFile(path.slice('md/'.length))
      }
    })
  }

  function renameTarget(newName: string) {
    if (!editTarget) return
    const { kind, name } = editTarget
    setEditTarget(null)
    const from = pathOf(kind, name)
    const to = pathOf(kind, newName)
    if (from === to) return
    const problem =
      badName(newName) ??
      (to.toLowerCase() !== from.toLowerCase() && exists(to)
        ? `There's already a ${kind} named ${newName} here.`
        : null)
    if (problem) return setError(problem)
    run('Renaming in Google Drive…', () => rename(from, to.split('/').pop()!))
  }

  function deleteTarget() {
    if (!editTarget) return
    const { kind, name } = editTarget
    const what = kind === 'folder' ? `the folder "${name}" and everything in it` : `"${name}"`
    if (!window.confirm(`Move ${what} to the Google Drive trash?`)) return
    setEditTarget(null)
    run('Moving to the Google Drive trash…', () => trash(pathOf(kind, name)))
  }

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
        <div className="projects-actions">
          <button
            type="button"
            className="back-button"
            disabled={busy !== null}
            onClick={() => setAdding('folder')}
          >
            Add Folder
          </button>
          <button
            type="button"
            className="back-button"
            disabled={busy !== null}
            onClick={() => setAdding('note')}
          >
            Add Note
          </button>
          <button
            type="button"
            className={`back-button${editing ? ' active' : ''}`}
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>
      {adding && (
        <NameDialog
          title={adding === 'folder' ? 'New folder' : 'New note'}
          onSave={(name) => create(adding, name)}
          onClose={() => setAdding(null)}
        />
      )}
      {editTarget && (
        <NameDialog
          title={editTarget.kind === 'folder' ? 'Edit folder' : 'Edit note'}
          initialName={editTarget.name}
          saveLabel="Save"
          onSave={renameTarget}
          onDelete={deleteTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
      {busy && <p className="library-message">{busy}</p>}
      {error && <p className="md-file-error">{error}</p>}
      {notes.length === 0 && folders.length === 0 && (
        <p className="library-message">No .md files in md/{title}.</p>
      )}
      <div className="project-bubbles">
        {here.map((note) => (
          <button
            key={note.file}
            type="button"
            className={`project-bubble note${editing ? ' editing' : ''}`}
            disabled={busy !== null && editing}
            onClick={() =>
              editing
                ? setEditTarget({ kind: 'note', name: note.name })
                : setOpenFile(note.file)
            }
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
            className={`project-bubble folder${editing ? ' editing' : ''}`}
            disabled={busy !== null && editing}
            onClick={() =>
              editing ? setEditTarget({ kind: 'folder', name }) : setFolder([...folder, name])
            }
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
