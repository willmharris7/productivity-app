import { useState } from 'react'
import InteractionDialog, { type Interaction } from './InteractionDialog.tsx'
import NameDialog from './NameDialog.tsx'
import NotesTextarea from './NotesTextarea.tsx'
import { useTextFile } from './useMdFile.ts'
import { createFolder, exists, listFiles, readText, rename, saveText, trash } from './drive.ts'

type Kind = 'project' | 'contact'

// Folder in the Files folder whose .json files this page shows.
const FOLDER = 'json'

// Path in Drive of the file named `name` (with or without .json).
const pathOf = (name: string) => `${FOLDER}/${/\.json$/i.test(name) ? name : `${name}.json`}`

// The `type` field of a .json file, or null if it's missing or the file isn't valid JSON.
function kindOf(path: string): Kind | null {
  try {
    const type = JSON.parse(readText(path))?.type
    return type === 'project' || type === 'contact' ? type : null
  } catch {
    return null
  }
}

// The Communication page: a heading with Add project and Edit buttons, and a bubble for
// each .json file in the json folder in Google Drive. Add project asks for a name, then
// creates <name>.json there (making the folder if it's missing). In edit
// mode (the Edit button), clicking a bubble renames its file or moves it to the Drive trash;
// otherwise it opens the file's sections for editing (see JsonFileEditor).
function CommunicationScreen() {
  // Whether the Add project dialog is open, what's being changed in Drive, and the last error.
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after creating, renaming or deleting, to re-read the listing.
  const [, setCreated] = useState(0)
  // Edit mode, and the name of the file whose rename/delete dialog is open.
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  // The open file's path, if any.
  const [openPath, setOpenPath] = useState<string | null>(null)

  const entries = listFiles(FOLDER, '.json', false)
    .map((path) => ({
      path,
      name: path.split('/').pop()!.replace(/\.json$/i, ''),
      kind: kindOf(path),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  async function create(name: string) {
    setAdding(false)
    setError(null)
    if (/[/\\]/.test(name)) return setError('Names can’t contain / or \\.')
    const path = pathOf(name)
    if (exists(path)) return setError(`There's already a file named ${name} in ${FOLDER}.`)
    setBusy('Creating in Google Drive…')
    try {
      if (!exists(FOLDER)) await createFolder(FOLDER)
      await saveText(path, null, JSON.stringify({ type: 'project', name }, null, 2) + '\n')
      setBusy(null)
      setCreated((n) => n + 1)
    } catch (e) {
      setBusy(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const open = entries.find((entry) => entry.path === openPath)
  if (open) {
    return (
      <JsonFileEditor
        key={open.path}
        path={open.path}
        name={open.name}
        onBack={() => setOpenPath(null)}
      />
    )
  }

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

  function renameTarget(newName: string) {
    if (editTarget === null) return
    const from = pathOf(editTarget)
    const to = pathOf(newName)
    setEditTarget(null)
    if (from === to) return
    if (/[/\\]/.test(newName)) return setError('Names can’t contain / or \\.')
    if (to.toLowerCase() !== from.toLowerCase() && exists(to))
      return setError(`There's already a file named ${newName} in ${FOLDER}.`)
    run('Renaming in Google Drive…', () => rename(from, to.split('/').pop()!))
  }

  function deleteTarget() {
    if (editTarget === null) return
    if (!window.confirm(`Move "${editTarget}" to the Google Drive trash?`)) return
    const path = pathOf(editTarget)
    setEditTarget(null)
    run('Moving to the Google Drive trash…', () => trash(path))
  }

  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        <h2>Communication</h2>
        <div className="projects-actions">
          <button
            type="button"
            className="back-button"
            disabled={busy !== null}
            onClick={() => setAdding(true)}
          >
            Add project
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
          title="New project"
          onSave={create}
          onClose={() => setAdding(false)}
        />
      )}
      {editTarget !== null && (
        <NameDialog
          title="Edit file"
          initialName={editTarget}
          saveLabel="Save"
          onSave={renameTarget}
          onDelete={deleteTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
      {busy && <p className="library-message">{busy}</p>}
      {error && <p className="md-file-error">{error}</p>}
      {entries.length === 0 && <p className="library-message">No .json files in {FOLDER}.</p>}
      <div className="project-bubbles">
        {entries.map((entry) => {
          const content = (
            <>
              <span className="project-bubble-icon" aria-hidden="true">
                {entry.kind === 'contact' ? '👤' : entry.kind === 'project' ? '📁' : '📄'}
              </span>
              {entry.name}
            </>
          )
          return (
            <button
              key={entry.path}
              type="button"
              className={`project-bubble note${editing ? ' editing' : ''}`}
              disabled={busy !== null && editing}
              onClick={() => (editing ? setEditTarget(entry.name) : setOpenPath(entry.path))}
            >
              {content}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Keys every file has that aren't shown as sections.
const HIDDEN_KEYS = new Set(['type', 'name'])

type Status = 'red' | 'yellow' | 'green'
const STATUSES: { status: Status; label: string }[] = [
  { status: 'red', label: 'Red' },
  { status: 'yellow', label: 'Yellow' },
  { status: 'green', label: 'Green' },
]
const isStatus = (value: unknown): value is Status =>
  value === 'red' || value === 'yellow' || value === 'green'

// A contact is stored as
// { "kind": "contact", "status": "red" | "yellow" | "green", "contact": "...", "notes": "...",
//   "interactions": [{ "date": "2026-11-19", "text": "..." }, ...] }
// (older files have bare date strings as interactions, read as ones with no text);
// these are its editable text fields, in the order shown, with their headings ("contact" is
// shown as Info).
const CONTACT_FIELDS = [
  { field: 'contact', heading: 'Info' },
  { field: 'notes', heading: 'Notes' },
] as const
type ContactField = (typeof CONTACT_FIELDS)[number]['field']
type Contact = {
  key: string
  status: Status | null
  interactions: Interaction[] // newest first
  value: Record<string, unknown>
}

// A YYYY-MM-DD date as e.g. "Thu, Nov 19, 2026" (as a local date, not UTC).
function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function contactOf(key: string, value: unknown): Contact | null {
  if (HIDDEN_KEYS.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.kind !== 'contact') return null
  const interactions = (Array.isArray(record.interactions) ? record.interactions : []).flatMap(
    (item: unknown): Interaction[] => {
      if (typeof item === 'string') return [{ date: item, text: '' }]
      if (item && typeof item === 'object') {
        const { date, text } = item as Record<string, unknown>
        if (typeof date === 'string') return [{ date, text: typeof text === 'string' ? text : '' }]
      }
      return []
    },
  )
  return {
    key,
    status: isStatus(record.status) ? record.status : null,
    interactions: interactions.sort((a, b) => b.date.localeCompare(a.date)),
    value: record,
  }
}

// Red / Yellow / Green toggle buttons; `value` is the one shown as picked.
function StatusPicker({ value, onChange }: { value: Status | null; onChange: (s: Status) => void }) {
  return (
    <div className="status-picker" role="radiogroup" aria-label="Status">
      {STATUSES.map(({ status, label }) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={value === status}
          className={`status-option ${status}${value === status ? ' active' : ''}`}
          onClick={() => onChange(status)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// One open .json file, in one of two modes picked with the Tracker and Contacts buttons
// (Tracker first). Tracker shows Red, Yellow and Green rows, top to bottom, each with the
// most recent interaction of every contact with that status, side by side. Contacts has an Add contact button (asking for a name and
// a status, then opening the new contact), an Edit button and a bubble for every contact; in edit mode, clicking a bubble
// renames or deletes that contact. Clicking a contact in either mode opens its
// status, its Info and Notes sections, and its Interactions (a date and text each, added with
// Add Interaction; clicking one opens it to change its date or text, or delete it). Edits are saved back into the
// file as you type (see useTextFile); fields that aren't contacts are kept as they are.
function JsonFileEditor({ path, name, onBack }: { path: string; name: string; onBack: () => void }) {
  const { text, setText, error } = useTextFile(path)
  const [mode, setMode] = useState<'tracker' | 'contacts'>('tracker')
  // Whether the Add contact dialog is open, and the status picked in it.
  const [adding, setAdding] = useState(false)
  const [newStatus, setNewStatus] = useState<Status>('red')
  const [addError, setAddError] = useState<string | null>(null)
  // Edit mode in Contacts, and the key of the contact whose rename/delete dialog is open.
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  // Key of the open contact, if any, and its open interaction dialog: 'new' for Add
  // Interaction, or the index (in contact.interactions) of the one being edited.
  const [openContact, setOpenContact] = useState<string | null>(null)
  const [interactionDialog, setInteractionDialog] = useState<'new' | number | null>(null)

  let data: Record<string, unknown> | null = null
  let parseError: string | null = null
  if (text !== null) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        data = parsed as Record<string, unknown>
      else parseError = `${name} isn't a JSON object, so it can't be edited here.`
    } catch {
      parseError = `${name} isn't valid JSON, so it can't be edited here.`
    }
  }
  const contacts = (data ? Object.entries(data) : [])
    .map(([key, value]) => contactOf(key, value))
    .filter((contact) => contact !== null)
    .sort((a, b) => a.key.localeCompare(b.key))

  const write = (next: Record<string, unknown>) => setText(JSON.stringify(next, null, 2) + '\n')

  function addContact(contactName: string) {
    setAdding(false)
    if (!data) return
    if (HIDDEN_KEYS.has(contactName) || contactName in data)
      return setAddError(`There's already something named ${contactName} in ${name}.`)
    setAddError(null)
    write({ ...data, [contactName]: { kind: 'contact', status: newStatus, contact: '', notes: '' } })
    setOpenContact(contactName)
  }

  // Renames the contact in the edit dialog, keeping its place in the file.
  function renameContact(newName: string) {
    const from = editTarget
    setEditTarget(null)
    if (!data || from === null || from === newName) return
    if (HIDDEN_KEYS.has(newName) || newName in data)
      return setAddError(`There's already something named ${newName} in ${name}.`)
    setAddError(null)
    write(Object.fromEntries(Object.entries(data).map(([k, v]) => [k === from ? newName : k, v])))
  }

  function deleteContact() {
    const target = editTarget
    if (!data || target === null) return
    if (!window.confirm(`Delete the contact "${target}" and all of its interactions?`)) return
    setEditTarget(null)
    const next = { ...data }
    delete next[target]
    write(next)
  }

  // Saves a new value into one field of a contact, keeping its other fields.
  function setContactField(
    { key, value }: Contact,
    field: ContactField | 'status',
    next: string,
  ) {
    if (!data) return
    write({ ...data, [key]: { ...value, [field]: next } })
  }

  // Saves a contact's interactions, oldest first.
  function setInteractions({ key, value }: Contact, next: Interaction[]) {
    setInteractionDialog(null)
    if (!data) return
    const sorted = [...next].sort((a, b) => a.date.localeCompare(b.date))
    write({ ...data, [key]: { ...value, interactions: sorted } })
  }

  const contactBubble = (c: Contact) => (
    <button
      key={c.key}
      type="button"
      className={`project-bubble note${editing ? ' editing' : ''}`}
      onClick={() => (editing ? setEditTarget(c.key) : setOpenContact(c.key))}
    >
      <span className="project-bubble-icon" aria-hidden="true">
        👤
      </span>
      {c.key}
    </button>
  )

  // A contact's most recent interaction (or that it has none), for the Tracker rows.
  const latestInteraction = (c: Contact) => (
    <button
      key={c.key}
      type="button"
      className="tracker-interaction"
      onClick={() => {
        setMode('contacts')
        setOpenContact(c.key)
      }}
    >
      <span className="tracker-interaction-date">
        {c.interactions.length > 0 ? formatDate(c.interactions[0].date) : 'No interactions'}
      </span>
      <span className="tracker-interaction-name">👤 {c.key}</span>
    </button>
  )

  // The Tracker / Contacts buttons, shown in the top bar of both the list and an open
  // contact; from an open contact, clicking one closes it and shows that mode. Opening a
  // contact (even from Tracker) switches to Contacts, so Back returns to the contacts list.
  const modeToggle = (['tracker', 'contacts'] as const).map((m) => (
    <button
      key={m}
      type="button"
      className={`back-button${mode === m ? ' active' : ''}`}
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m)
        setOpenContact(null)
        setInteractionDialog(null)
      }}
    >
      {m === 'tracker' ? 'Tracker' : 'Contacts'}
    </button>
  ))

  const contact = contacts.find((c) => c.key === openContact)
  if (contact) {
    return (
      <section className="projects-screen">
        <div className="sources-screen-header">
          <button type="button" className="back-button" onClick={() => setOpenContact(null)}>
            ← Back
          </button>
          <h2>
            <span aria-hidden="true">👤 </span>
            {contact.key}
          </h2>
          <div className="projects-actions">{modeToggle}</div>
        </div>
        {error && <p className="md-file-error">{error}</p>}
        <StatusPicker
          value={contact.status}
          onChange={(status) => setContactField(contact, 'status', status)}
        />
        {CONTACT_FIELDS.map(({ field, heading }) => {
          const value = contact.value[field]
          return (
            <div key={field} className="json-section">
              <h3>{heading}</h3>
              <NotesTextarea
                className="json-section-editor"
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => setContactField(contact, field, next)}
                placeholder="Start writing… (start a line with - for a bullet)"
              />
            </div>
          )
        })}
        <div className="json-section">
          <div className="interactions-header">
            <h3>Interactions</h3>
            <button
              type="button"
              className="back-button"
              onClick={() => setInteractionDialog('new')}
            >
              Add Interaction
            </button>
          </div>
          {contact.interactions.length === 0 ? (
            <p className="library-message">No interactions yet.</p>
          ) : (
            <ul className="interactions">
              {contact.interactions.map((interaction, i) => (
                <li key={`${interaction.date}-${i}`}>
                  <button
                    type="button"
                    className="interaction"
                    onClick={() => setInteractionDialog(i)}
                  >
                    <span className="interaction-date">{formatDate(interaction.date)}</span>
                    {interaction.text && (
                      <span className="interaction-preview">{interaction.text}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {interactionDialog === 'new' && (
          <InteractionDialog
            onSave={(interaction) => setInteractions(contact, [...contact.interactions, interaction])}
            onClose={() => setInteractionDialog(null)}
          />
        )}
        {typeof interactionDialog === 'number' && contact.interactions[interactionDialog] && (
          <InteractionDialog
            key={interactionDialog}
            initial={contact.interactions[interactionDialog]}
            onSave={(interaction) =>
              setInteractions(
                contact,
                contact.interactions.map((old, i) => (i === interactionDialog ? interaction : old)),
              )
            }
            onDelete={() =>
              setInteractions(
                contact,
                contact.interactions.filter((_, i) => i !== interactionDialog),
              )
            }
            onClose={() => setInteractionDialog(null)}
          />
        )}
      </section>
    )
  }

  // Contacts without a status (made before statuses) get their own row in Tracker.
  const unsorted = contacts.filter((c) => c.status === null)

  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2>{name}</h2>
        <div className="projects-actions">
          {data && mode === 'contacts' && (
            <>
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setNewStatus('red')
                  setAdding(true)
                }}
              >
                Add contact
              </button>
              <button
                type="button"
                className={`back-button${editing ? ' active' : ''}`}
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? 'Done' : 'Edit'}
              </button>
            </>
          )}
          {modeToggle}
        </div>
      </div>
      {error && <p className="md-file-error">{error}</p>}
      {parseError && <p className="md-file-error">{parseError}</p>}
      {data && mode === 'tracker' && (
        <div className="tracker">
          {STATUSES.map(({ status, label }) => (
            <div key={status} className={`tracker-row ${status}`}>
              <h3>{label}</h3>
              <div className="tracker-contacts">
                {contacts.filter((c) => c.status === status).map(latestInteraction)}
              </div>
            </div>
          ))}
          {unsorted.length > 0 && (
            <div className="tracker-row">
              <h3>No status</h3>
              <div className="tracker-contacts">{unsorted.map(latestInteraction)}</div>
            </div>
          )}
        </div>
      )}
      {data && mode === 'contacts' && (
        <>
          {addError && <p className="md-file-error">{addError}</p>}
          {contacts.length === 0 && <p className="library-message">No contacts yet.</p>}
          <div className="project-bubbles">{contacts.map(contactBubble)}</div>
        </>
      )}
      {adding && (
        <NameDialog
          title="New contact"
          onSave={addContact}
          onClose={() => setAdding(false)}
        >
          <StatusPicker value={newStatus} onChange={setNewStatus} />
        </NameDialog>
      )}
      {editTarget !== null && (
        <NameDialog
          title="Edit contact"
          initialName={editTarget}
          saveLabel="Save"
          onSave={renameContact}
          onDelete={deleteContact}
          onClose={() => setEditTarget(null)}
        />
      )}
    </section>
  )
}

export default CommunicationScreen
