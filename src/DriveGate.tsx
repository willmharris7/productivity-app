import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isSignedIn, loadIndex, signIn, subscribe } from './drive.ts'

// Shows a "Connect Google Drive" screen until the user signs in and the Files folder is
// downloaded (only files changed since the last visit; see loadIndex), then the app. If sign-in runs out later (about an hour), a bar asks the user to
// reconnect; saves wait for that rather than failing.
function DriveGate({ children }: { children: ReactNode }) {
  const signedIn = useSyncExternalStore(subscribe, isSignedIn)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped by "Try again" to reload the folder listing.
  const [attempt, setAttempt] = useState(0)
  // Files downloaded so far, while any are needed.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadIndex((done, total) => !cancelled && setProgress({ done, total }))
      .then(() => !cancelled && setReady(true))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const connect = () => {
    setError(null)
    signIn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  if (ready)
    return (
      <>
        {children}
        {!signedIn && (
          <div className="drive-reconnect" role="alert">
            Your Google Drive sign-in ran out. Changes will save once you reconnect.
            <button type="button" className="back-button active" onClick={connect}>
              Reconnect
            </button>
            {error && <span className="md-file-error">{error}</span>}
          </div>
        )}
      </>
    )

  return (
    <div className="drive-gate">
      <h1>Productivity App</h1>
      {!signedIn ? (
        <>
          <p>Your notes, calendars and library live in the Files folder in your Google Drive.</p>
          <button type="button" className="back-button active" onClick={connect}>
            Connect Google Drive
          </button>
        </>
      ) : error ? (
        <button
          type="button"
          className="back-button"
          onClick={() => {
            setError(null)
            setAttempt((n) => n + 1)
          }}
        >
          Try again
        </button>
      ) : (
        <p>
          {progress && progress.total > 0
            ? `Downloading your files from Google Drive (${progress.done} of ${progress.total})…`
            : 'Checking your files in Google Drive…'}
        </p>
      )}
      {error && <p className="md-file-error">{error}</p>}
    </div>
  )
}

export default DriveGate
