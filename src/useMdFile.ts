import { useEffect, useRef, useState } from 'react'
import { readText, saveText } from './drive.ts'

function load(path: string): { text: string | null; error: string | null } {
  try {
    return { text: readText(path), error: null }
  } catch (e) {
    return { text: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// The text of a .md file in the md folder of the Files folder in Google Drive. `file` is
// its path inside md, e.g. 'Tasks/Tasks.md'. It's read from the local copy (see drive.ts),
// so it's there on the first render; `text` is null only if the file is missing. Edits
// are saved back into the file half a second after typing stops, unless it changed in
// Drive since it was loaded (see saveText). Read once per mount: give each file its own
// component (key it by file).
function useMdFile(file: string) {
  const path = `md/${file}`
  const [initial] = useState(() => load(path))
  const [text, setText] = useState(initial.text)
  const [error, setError] = useState(initial.error)
  // The file's contents as last loaded or saved.
  const onDisk = useRef(initial.text)
  // Saves run one at a time, so each one's `original` is the previous one's text.
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    if (text === null || text === onDisk.current) return
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const original = onDisk.current
        if (original === null || original === text) return
        try {
          await saveText(path, original, text)
          onDisk.current = text
          setError(null)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [path, text])

  return { text, setText, error }
}

export default useMdFile
