import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventFields } from './events.ts'
import {
  addEvent as addIcsEvent,
  insertEvents,
  newCalendarText,
  parseCalendar,
  removeEvent,
  updateEvent as updateIcsEvent,
  type CalendarEvent,
  type IcsFile,
} from './ics.ts'
import { listFiles, readText, saveText } from './drive.ts'

// Every .ics file directly inside the ics folder in Google Drive, from the local copy
// (see drive.ts).
async function loadFiles(): Promise<IcsFile[]> {
  return listFiles('ics', '.ics', false).map((path) => ({
    file: path.split('/').pop()!,
    text: readText(path),
  }))
}

// The calendars in the ics folder in Google Drive, and the edits the calendar screen makes
// to them. Every change is written straight back into the files (see saveText).
function useIcsCalendars() {
  const [files, setFiles] = useState<IcsFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Latest files, for building the next change without waiting for a render.
  const filesRef = useRef<IcsFile[]>([])
  // Each file's contents as last loaded or saved (null: not created yet).
  const onDisk = useRef(new Map<string, string | null>())
  // Saves run one at a time, so each one's `original` is the previous one's text.
  const saveQueue = useRef(Promise.resolve())

  const commit = useCallback((next: IcsFile[]) => {
    const before = new Map(filesRef.current.map((f) => [f.file, f.text]))
    filesRef.current = next
    setFiles(next)
    for (const { file, text } of next) {
      if (before.get(file) === text) continue
      saveQueue.current = saveQueue.current.then(async () => {
        const original = onDisk.current.has(file) ? onDisk.current.get(file)! : null
        if (original === text) return
        try {
          await saveText(`ics/${file}`, original, text)
          onDisk.current.set(file, text)
          setError(null)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    }
  }, [])

  const calendars = useMemo(() => (files ?? []).map(parseCalendar), [files])

  // Applies `edit` to each named file's text; a thrown error leaves every file as it was.
  const change = useCallback(
    (edits: Record<string, (text: string) => string>) => {
      try {
        commit(
          filesRef.current.map((f) => (edits[f.file] ? { ...f, text: edits[f.file](f.text) } : f)),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [commit],
  )

  useEffect(() => {
    let cancelled = false
    loadFiles()
      .then((loaded) => {
        if (cancelled) return
        loaded.sort((a, b) => a.file.localeCompare(b.file))
        onDisk.current = new Map(loaded.map((f) => [f.file, f.text]))
        filesRef.current = loaded
        setFiles(loaded)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const addEvent = (fields: EventFields, date: string) =>
    change({ [fields.calendar]: (text) => addIcsEvent(text, fields, date) })

  // Changing the calendar moves the event (with its changed occurrences) to that file.
  const updateEvent = (event: CalendarEvent, fields: EventFields) => {
    const from = event.calendar
    if (fields.calendar === from) {
      change({ [from]: (text) => updateIcsEvent(text, event.uid, fields, event.date, event.repeat) })
      return
    }
    const source = filesRef.current.find((f) => f.file === from)
    if (!source) return
    try {
      const { text, removed, timezones } = removeEvent(source.text, event.uid)
      change({
        [from]: () => text,
        [fields.calendar]: (target) =>
          updateIcsEvent(insertEvents(target, removed, timezones), event.uid, fields, event.date, event.repeat),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteEvent = (event: CalendarEvent) =>
    change({ [event.calendar]: (text) => removeEvent(text, event.uid).text })

  // Adds a new, empty calendar file; returns its file name.
  const createCalendar = (name: string, color: string): string | null => {
    const file = `${name.replace(/[\\/:*?"<>|]/g, '').trim()}.ics`
    if (file === '.ics') {
      setError('That name has no usable characters for a file name.')
      return null
    }
    if (filesRef.current.some((f) => f.file.toLowerCase() === file.toLowerCase())) {
      setError(`There's already a calendar file named ${file}.`)
      return null
    }
    commit(
      [...filesRef.current, { file, text: newCalendarText(name, color) }].sort((a, b) =>
        a.file.localeCompare(b.file),
      ),
    )
    return file
  }

  return {
    loading: files === null && !error,
    calendars,
    error,
    clearError: () => setError(null),
    addEvent,
    updateEvent,
    deleteEvent,
    createCalendar,
  }
}

export default useIcsCalendars
