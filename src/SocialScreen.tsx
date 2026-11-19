import { useState } from 'react'
import NameDialog from './NameDialog.tsx'
import { createFolder, exists, saveText } from './drive.ts'

type Kind = 'project' | 'contact'

// The Social page: a heading with Add project, Add contact and Edit buttons. Add project
// and Add contact ask for a name, then create <name>.json in the json folder in Google
// Drive (making the folder if it's missing). Edit doesn't do anything yet.
function SocialScreen() {
  // Which name dialog is open, what's being changed in Drive, and the last error.
  const [adding, setAdding] = useState<Kind | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Confirmation after the last create, since nothing on the page lists the files yet.
  const [created, setCreated] = useState<string | null>(null)

  async function create(kind: Kind, name: string) {
    setAdding(null)
    setError(null)
    setCreated(null)
    if (/[/\\]/.test(name)) return setError('Names can’t contain / or \\.')
    const path = `json/${/\.json$/i.test(name) ? name : `${name}.json`}`
    if (exists(path)) return setError(`There's already a file named ${name} in json.`)
    setBusy('Creating in Google Drive…')
    try {
      if (!exists('json')) await createFolder('json')
      await saveText(path, null, JSON.stringify({ type: kind, name }, null, 2) + '\n')
      setBusy(null)
      setCreated(`Created ${path} in Google Drive.`)
    } catch (e) {
      setBusy(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        <h2>Social</h2>
        <div className="projects-actions">
          <button
            type="button"
            className="back-button"
            disabled={busy !== null}
            onClick={() => setAdding('project')}
          >
            Add project
          </button>
          <button
            type="button"
            className="back-button"
            disabled={busy !== null}
            onClick={() => setAdding('contact')}
          >
            Add contact
          </button>
          <button type="button" className="back-button">
            Edit
          </button>
        </div>
      </div>
      {adding && (
        <NameDialog
          title={adding === 'project' ? 'New project' : 'New contact'}
          onSave={(name) => create(adding, name)}
          onClose={() => setAdding(null)}
        />
      )}
      {busy && <p className="library-message">{busy}</p>}
      {created && <p className="library-message">{created}</p>}
      {error && <p className="md-file-error">{error}</p>}
    </section>
  )
}

export default SocialScreen
