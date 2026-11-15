import { useEffect, useMemo, useState } from 'react'
import NameDialog from './NameDialog.tsx'
import { listFiles, readBytes, saveText } from './drive.ts'

// Every CSV directly inside the csv folder in Google Drive, by name.
function csvFiles() {
  return listFiles('csv', '.csv', false)
    .map((path) => ({ name: path.split('/').pop()!, path }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ok'; text: string } & ReturnType<typeof parseCsv>)

// RFC 4180-style parsing: quoted fields may hold commas, newlines and "" escapes.
// ends[r] is the text offset just past row r's last field (before its line break),
// which is where a new row gets spliced in after it; starts[r] is where row r begins.
function parseCsv(text: string): { rows: string[][]; starts: number[]; ends: number[] } {
  const rows: string[][] = []
  const starts: number[] = []
  const ends: number[] = []
  let rowStart = 0
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      starts.push(rowStart)
      ends.push(i)
      if (ch === '\r' && text[i + 1] === '\n') i++
      rowStart = i + 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
    starts.push(rowStart)
    ends.push(text.length)
  }
  return { rows, starts, ends }
}

type Parsed = ReturnType<typeof parseCsv>

// The file's text with row `index` replaced by `row`; its line break is kept.
function replaceRow(text: string, parsed: Parsed, index: number, row: string[]): string {
  const line = row.map(csvField).join(',')
  return text.slice(0, parsed.starts[index]) + line + text.slice(parsed.ends[index])
}

// The file's text without row `index`, taking one line break with it.
function deleteRow(text: string, parsed: Parsed, index: number): string {
  const { starts, ends } = parsed
  if (index + 1 < starts.length)
    return text.slice(0, starts[index]) + text.slice(starts[index + 1])
  // Last row: drop the line break before it instead.
  const from = index > 0 ? ends[index - 1] : starts[index]
  return text.slice(0, from) + text.slice(ends[index])
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// The file's text with `row` added as a new line right after row `afterRow`
// (-1 = at the very top), using the file's own line-break style.
function insertRow(
  text: string,
  ends: number[],
  afterRow: number,
  row: string[],
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const line = row.map(csvField).join(',')
  if (afterRow < 0) return line + eol + text
  const at = ends[afterRow]
  return text.slice(0, at) + eol + line + text.slice(at)
}

// Reads from the local copy of the Files folder (see drive.ts), so it's immediate.
function loadCsv(path: string): Loaded {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(readBytes(path))
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : "Couldn't load the file." }
  }
  // "PK" = a zip archive, which is what a Numbers/Excel file renamed to .csv looks like.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return {
      status: 'error',
      message:
        "This isn't plain CSV text — it looks like a Numbers or Excel file with a .csv name. Re-export it as CSV (in Numbers: File › Export To › CSV) and replace the file.",
    }
  }
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '') // drop a byte-order mark
  return { status: 'ok', text, ...parseCsv(text) }
}

// Which categories are collapsed, as "<file name>\0<category>" keys.
const COLLAPSED_STORAGE_KEY = 'libraryCollapsed'

function loadCollapsed(): Set<string> {
  try {
    const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    return new Set(saved ? (JSON.parse(saved) as string[]) : [])
  } catch {
    return new Set()
  }
}

// Sections created with "Add New Section" that have no entries yet, by file name.
// A CSV can't hold an empty category, so these live here until their first
// entry is added (which writes the category into the file).
const EMPTY_SECTIONS_STORAGE_KEY = 'libraryEmptySections'

function loadEmptySections(): Record<string, string[]> {
  try {
    const saved = localStorage.getItem(EMPTY_SECTIONS_STORAGE_KEY)
    return saved ? (JSON.parse(saved) as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

// Inputs fill their cell (width: 100%), which doesn't make a column any wider,
// so give each a min-width from its text; otherwise editing a long title
// shrinks its column to the CSS minimum and clips the text.
// Narrow columns (years) get a smaller floor.
function inputWidth(text: string | undefined, narrow = false): { minWidth: string } {
  return { minWidth: `${Math.max(narrow ? 7 : 12, (text ?? '').length + 3)}ch` }
}

// Year columns hold short values, so they're drawn about half as wide.
function isNarrowColumn(name: string | undefined): boolean {
  return /\byear\b/i.test(name ?? '')
}

function findCategoryColumn(row: string[]): number {
  return row.findIndex((cell) => cell.trim().toLowerCase() === 'category')
}

type Group = {
  category: string | null // null when the file has no Category column (one ungrouped block)
  rows: string[][]
  indices: number[] // each row's index in the whole file
  lastIndex: number // index in the whole file of the group's last row (new rows go after it)
}

// rows[headerIndex] is the header; everything after it is grouped.
function groupByCategory(
  rows: string[][],
  headerIndex: number,
  categoryColumn: number,
): Group[] {
  const body = rows.slice(headerIndex + 1)
  if (categoryColumn < 0)
    return [
      {
        category: null,
        rows: body,
        indices: body.map((_, r) => headerIndex + 1 + r),
        lastIndex: rows.length - 1,
      },
    ]
  const groups = new Map<string, Group>()
  body.forEach((row, r) => {
    const category = (row[categoryColumn] ?? '').trim()
    const index = headerIndex + 1 + r
    const group = groups.get(category)
    if (group) {
      group.rows.push(row)
      group.indices.push(index)
      group.lastIndex = index
    } else
      groups.set(category, { category, rows: [row], indices: [index], lastIndex: index })
  })
  return [...groups.values()]
}

// The Library page: a table view of the CSVs in the csv folder in Google Drive.
function LibraryScreen() {
  const FILES = useMemo(() => csvFiles(), [])
  // The file open in the table viewer; null shows the bubbles listing every file.
  const [openFile, setOpenFile] = useState<string | null>(null)
  const selected = openFile ?? ''
  // Result for the file it was loaded from (set when a file is opened, and after each save).
  const [result, setResult] = useState<{ name: string; loaded: Loaded } | null>(
    null,
  )
  const file = FILES.find((f) => f.name === selected)
  const loaded: Loaded =
    result?.name === selected ? result.loaded : { status: 'loading' }


  const [collapsed, setCollapsed] = useState(loadCollapsed)
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]))
    } catch {
      // Storage unavailable; collapsing still works for this session.
    }
  }, [collapsed])
  const collapseKey = (category: string) => `${selected}\u0000${category}`
  const toggleCategory = (category: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      const key = collapseKey(category)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Unsaved text in each group's blank row, by collapseKey(category) then column.
  const [drafts, setDrafts] = useState<Record<string, Record<number, string>>>({})
  const [saving, setSaving] = useState<string | null>(null) // collapseKey being saved
  const [saveError, setSaveError] = useState<{ key: string; message: string } | null>(
    null,
  )
  const [emptySections, setEmptySections] = useState(loadEmptySections)
  useEffect(() => {
    try {
      localStorage.setItem(EMPTY_SECTIONS_STORAGE_KEY, JSON.stringify(emptySections))
    } catch {
      // Storage unavailable; new sections last until the page reloads.
    }
  }, [emptySections])
  const setFileEmptySections = (update: (names: string[]) => string[]) =>
    setEmptySections((prev) => ({ ...prev, [selected]: update(prev[selected] ?? []) }))
  const [addingSection, setAddingSection] = useState(false)
  // "Delete Section" mode: shows a Delete button on every section heading.
  const [deletingSections, setDeletingSections] = useState(false)
  const setDraft = (key: string, column: number, value: string) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [column]: value } }))
  // The row being edited (clicked), by its index in the whole file.
  const [editing, setEditing] = useState<{
    file: string
    index: number
    values: Record<number, string>
  } | null>(null)
  const editingIndex = editing?.file === selected ? editing.index : null

  const rows = loaded.status === 'ok' ? loaded.rows : []
  // Numbers exports put a title row ("Table 1") above the real header, so the
  // header is the first row with a "Category" cell; without one, it's row 0.
  const headerIndex = Math.max(0, rows.findIndex((r) => findCategoryColumn(r) >= 0))
  const header = rows[headerIndex] ?? []
  const categoryColumn = findCategoryColumn(header)
  const columnCount = Math.max(0, ...rows.slice(headerIndex).map((r) => r.length))
  // Rows grouped by category, in order of first appearance; the category
  // column itself is hidden since each group's heading shows it.
  const fileGroups = groupByCategory(rows, headerIndex, categoryColumn)
  // Plus any new, still-empty sections at the end; their first entry goes at
  // the end of the file.
  const groups: Group[] =
    categoryColumn < 0
      ? fileGroups
      : [
          ...fileGroups,
          ...(emptySections[selected] ?? [])
            .filter((name) => !fileGroups.some((g) => g.category === name))
            .map((name) => ({
              category: name,
              rows: [],
              indices: [],
              lastIndex: rows.length - 1,
            })),
        ]
  const columns = Array.from({ length: columnCount }, (_, i) => i).filter(
    (i) => i !== categoryColumn,
  )
  const narrow = new Set(columns.filter((i) => isNarrowColumn(header[i])))
  const narrowClass = (i: number) => (narrow.has(i) ? 'library-narrow' : undefined)
  // Narrow columns use the header's last word ("Year") so it fits the input.
  const placeholder = (i: number) =>
    narrow.has(i) ? header[i].trim().split(/\s+/).pop() : header[i]

  // Writes `text` as the file's new contents; errors show under the group `key`.
  async function commit(key: string, text: string, onSaved: () => void) {
    if (loaded.status !== 'ok' || !file) return
    setSaving(key)
    setSaveError(null)
    try {
      await saveText(file.path, loaded.text, text)
      setResult({ name: file.name, loaded: { status: 'ok', text, ...parseCsv(text) } })
      onSaved()
    } catch (e) {
      setSaveError({ key, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(null)
    }
  }

  function addRow(group: Group) {
    if (loaded.status !== 'ok') return
    const key = collapseKey(group.category ?? '')
    const draft = drafts[key] ?? {}
    const row = Array.from({ length: columnCount }, (_, i) =>
      i === categoryColumn ? (group.category ?? '') : (draft[i] ?? '').trim(),
    )
    // With no rows yet (and no header), the new row goes at the very top.
    const afterRow = rows.length ? Math.max(group.lastIndex, headerIndex) : -1
    const text = insertRow(loaded.text, loaded.ends, afterRow, row)
    commit(key, text, () => {
      setDrafts((prev) => ({ ...prev, [key]: {} }))
      // Now that it has an entry, the section is in the file itself.
      setFileEmptySections((names) => names.filter((n) => n !== group.category))
    })
  }

  function addSection(name: string) {
    setAddingSection(false)
    if (groups.some((g) => g.category === name)) return
    setFileEmptySections((names) => [...names, name])
  }

  // Removes the section and every entry in it from the file, without asking.
  function deleteSection(group: Group) {
    if (loaded.status !== 'ok' || group.category === null) return
    const key = collapseKey(group.category)
    const name = group.category
    const forget = () => setFileEmptySections((names) => names.filter((n) => n !== name))
    if (!group.indices.length) return forget()
    // Delete from the bottom up, re-parsing so each row's offsets are current.
    let text = loaded.text
    for (const index of [...group.indices].sort((a, b) => b - a))
      text = deleteRow(text, parseCsv(text), index)
    commit(key, text, () => {
      forget()
      setEditing(null)
    })
  }

  function startEditing(index: number) {
    if (editingIndex === index) return
    const values = Object.fromEntries(rows[index].map((v, i) => [i, v]))
    setEditing({ file: selected, index, values })
    setSaveError(null)
  }

  function saveEdit(key: string) {
    if (loaded.status !== 'ok' || !editing || editingIndex === null) return
    const original = rows[editingIndex]
    // Keep the row's full width (including blank trailing columns) as it was,
    // widening it only if a column past its end was filled in.
    const row = Array.from({ length: Math.max(original.length, columnCount) }, (_, i) =>
      (editing.values[i] ?? original[i] ?? '').trim(),
    )
    while (row.length > original.length && !row[row.length - 1]) row.pop()
    if (row.every((v, i) => v === (original[i] ?? ''))) return setEditing(null)
    const text = replaceRow(loaded.text, loaded, editingIndex, row)
    commit(key, text, () => setEditing(null))
  }

  function deleteEditing(key: string) {
    if (loaded.status !== 'ok' || editingIndex === null) return
    const text = deleteRow(loaded.text, loaded, editingIndex)
    commit(key, text, () => setEditing(null))
  }

  if (openFile === null)
    return (
      <section className="projects-screen library-screen">
        <div className="sources-screen-header">
          <h2>Library</h2>
        </div>
        {FILES.length === 0 ? (
          <p className="library-message">No CSV files in the csv folder.</p>
        ) : (
          <div className="project-bubbles">
            {FILES.map((f) => (
              <button
                key={f.name}
                type="button"
                className="project-bubble note"
                onClick={() => {
                  setOpenFile(f.name)
                  setResult({ name: f.name, loaded: loadCsv(f.path) })
                }}
              >
                <span className="project-bubble-icon" aria-hidden="true">
                  📄
                </span>
                {f.name.replace(/\.csv$/i, '')}
              </button>
            ))}
          </div>
        )}
      </section>
    )

  return (
    <section className="projects-screen library-screen">
      <div className="sources-screen-header">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            setOpenFile(null)
            setDeletingSections(false)
            setSaveError(null)
          }}
        >
          ← Back
        </button>
        <h2>{selected.replace(/\.csv$/i, '')}</h2>
        {loaded.status === 'ok' && categoryColumn >= 0 && (
          <div className="projects-actions">
            <button
              type="button"
              className="back-button"
              onClick={() => setAddingSection(true)}
            >
              Add New Section
            </button>
            <button
              type="button"
              className={`back-button${deletingSections ? ' active' : ''}`}
              aria-pressed={deletingSections}
              onClick={() => setDeletingSections(!deletingSections)}
            >
              {deletingSections ? 'Done' : 'Delete Section'}
            </button>
          </div>
        )}
      </div>
      {addingSection && (
        <NameDialog
          title="New section"
          onSave={addSection}
          onClose={() => setAddingSection(false)}
        />
      )}
      {!file && <p className="library-message">This file is no longer in the csv folder.</p>}
      {file && loaded.status === 'loading' && (
        <p className="library-message">Loading…</p>
      )}
      {file && loaded.status === 'error' && (
        <p className="library-message">{loaded.message}</p>
      )}
      {file && loaded.status === 'ok' && (
        <div className="library-table-wrap">
          <table className="library-table">
            <thead>
              <tr>
                {columns.map((i) => (
                  <th key={i} className={narrowClass(i)}>{header[i] ?? ''}</th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            {groups.map((group) => {
              const { category, rows } = group
              const isCollapsed =
                category !== null && collapsed.has(collapseKey(category))
              const key = collapseKey(category ?? '')
              const draft = drafts[key] ?? {}
              const hasDraft = Object.values(draft).some((v) => v.trim())
              return (
                <tbody key={category ?? ''}>
                  {category !== null && (
                    <tr className="library-group-row">
                      <th colSpan={columns.length + 1}>
                        <div className="library-group-heading">
                          <button
                            type="button"
                            className="library-group-toggle"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleCategory(category)}
                          >
                            <span className="library-group-caret" aria-hidden="true">
                              {isCollapsed ? '▸' : '▾'}
                            </span>
                            {category || '(No category)'}
                            <span className="library-group-count">{rows.length}</span>
                          </button>
                          {deletingSections && (
                            <button
                              type="button"
                              className="library-add-button library-delete-button"
                              disabled={saving === key}
                              onClick={() => deleteSection(group)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </th>
                    </tr>
                  )}
                  {!isCollapsed &&
                    rows.map((row, r) => {
                      const index = group.indices[r]
                      if (index !== editingIndex || !editing)
                        return (
                          <tr
                            key={index}
                            className="library-row"
                            onClick={() => startEditing(index)}
                          >
                            {columns.map((i) => (
                              <td key={i} className={narrowClass(i)}>{row[i] ?? ''}</td>
                            ))}
                            <td />
                          </tr>
                        )
                      // Clicked row: its fields become inputs; Enter saves, Escape cancels.
                      return (
                        <tr key={index} className="library-edit-row">
                          {columns.map((i) => (
                            <td key={i} className={narrowClass(i)}>
                              {(header[i]?.trim() || row[i]) && (
                                <input
                                  className="library-new-input"
                                  size={1} // width comes from inputWidth, not the default ~20 characters
                                  style={inputWidth(editing.values[i], narrow.has(i))}
                                  aria-label={header[i] || `Column ${i + 1}`}
                                  value={editing.values[i] ?? ''}
                                  disabled={saving === key}
                                  autoFocus={i === columns[0]}
                                  onChange={(e) =>
                                    setEditing({
                                      ...editing,
                                      values: { ...editing.values, [i]: e.target.value },
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit(key)
                                    if (e.key === 'Escape') setEditing(null)
                                  }}
                                />
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="library-row-actions">
                            <button
                              type="button"
                              className="library-add-button"
                              disabled={saving === key}
                              onClick={() => saveEdit(key)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="library-add-button library-delete-button"
                              disabled={saving === key}
                              onClick={() => deleteEditing(key)}
                            >
                              Delete
                            </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  {!isCollapsed && (
                    <tr className="library-new-row">
                      {columns.map((i) => (
                        <td key={i} className={narrowClass(i)}>
                          {/* Only named columns get an input; blank trailing ones stay empty. */}
                          {header[i]?.trim() && (
                            <input
                              className="library-new-input"
                              size={1} // width comes from inputWidth, not the default ~20 characters
                              style={inputWidth(draft[i] || placeholder(i), narrow.has(i))}
                              placeholder={placeholder(i)}
                              aria-label={`New ${header[i]}${category ? ` in ${category}` : ''}`}
                              value={draft[i] ?? ''}
                              disabled={saving === key}
                              onChange={(e) => setDraft(key, i, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && hasDraft) addRow(group)
                              }}
                            />
                          )}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="library-add-button"
                          disabled={!hasDraft || saving === key}
                          onClick={() => addRow(group)}
                        >
                          {saving === key ? 'Adding…' : 'Add'}
                        </button>
                      </td>
                    </tr>
                  )}
                  {!isCollapsed && saveError?.key === key && (
                    <tr>
                      <td colSpan={columns.length + 1} className="library-save-error">
                        {saveError.message}
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}
          </table>
        </div>
      )}
    </section>
  )
}

export default LibraryScreen
