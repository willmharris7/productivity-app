// Google Drive as the app's file store. Everything the app reads and writes lives in the
// folder named "Files" at the top of My Drive, laid out as csv/, ics/ and md/ subfolders.
// Paths here are relative to that folder, e.g. 'md/Tasks/Tasks.md', and are matched
// ignoring case.
//
// loadIndex() downloads every .md, .csv and .ics file in the folder up front and keeps
// them in memory, so reading a file is instant. Downloads are also kept in IndexedDB:
// on the next visit only files whose checksum changed in Drive are downloaded again.
// Saves go straight to Drive and update both copies.
//
// Sign-in uses Google Identity Services (the script tag in index.html): signIn() opens
// Google's popup and gets an access token good for about an hour. The token is kept in
// localStorage so reloads don't ask again. When it runs out, Drive requests wait until
// the user signs in again (see DriveGate), so no edit is lost.

type TokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }) => { requestAccessToken: () => void }
          hasGrantedAllScopes: (response: TokenResponse, scope: string) => boolean
        }
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
// Full Drive access: the app edits files it didn't create.
const SCOPE = 'https://www.googleapis.com/auth/drive'
const ROOT_FOLDER_NAME = 'Files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

// ---- Sign-in ----

type Token = { value: string; expiresAt: number }
const TOKEN_STORAGE_KEY = 'driveToken'
// Treat tokens as expired a minute early, so a request never goes out with a dying one.
const EXPIRY_MARGIN_MS = 60_000

let token: Token | null = null
let expiryTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
// Requests waiting for the next sign-in.
let waiting: ((value: string) => void)[] = []

function setToken(next: Token | null) {
  token = next
  clearTimeout(expiryTimer)
  try {
    if (next) localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Storage unavailable; the token still works until the page reloads.
  }
  if (next) {
    expiryTimer = setTimeout(() => setToken(null), next.expiresAt - Date.now())
    const resolve = waiting
    waiting = []
    for (const r of resolve) r(next.value)
  }
  for (const listener of listeners) listener()
}

try {
  const saved = JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) ?? 'null') as Token | null
  if (saved && saved.expiresAt > Date.now()) setToken(saved)
} catch {
  // No saved token; the user signs in.
}

// For useSyncExternalStore: whether there's a usable token right now.
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const isSignedIn = () => token !== null

// Opens Google's sign-in popup. Call it from a click handler, or the browser blocks the popup.
export function signIn(): Promise<void> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts.oauth2
    if (!CLIENT_ID)
      return reject(new Error('VITE_GOOGLE_CLIENT_ID is missing from .env. Add it and restart npm run dev.'))
    if (!oauth2)
      return reject(new Error("Google's sign-in script hasn't loaded. Check your connection and reload."))
    oauth2
      .initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token)
            return reject(new Error(response.error_description ?? response.error ?? 'Sign-in failed.'))
          if (!oauth2.hasGrantedAllScopes(response, SCOPE))
            return reject(
              new Error('The app needs access to Google Drive. Sign in again and tick the Drive box.'),
            )
          setToken({
            value: response.access_token,
            expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
          })
          resolve()
        },
        error_callback: (error) =>
          reject(
            new Error(
              error.type === 'popup_closed'
                ? 'The sign-in window was closed before finishing.'
                : error.type === 'popup_failed_to_open'
                  ? 'The browser blocked the sign-in popup. Allow popups for this site and try again.'
                  : (error.message ?? 'Sign-in failed.'),
            ),
          ),
      })
      .requestAccessToken()
  })
}

// The current token, or (once it has run out) a wait for the next sign-in.
function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return Promise.resolve(token.value)
  if (token) setToken(null)
  return new Promise((resolve) => waiting.push(resolve))
}

type RequestOptions = { method?: string; headers?: Record<string, string>; body?: string }

async function driveFetch(url: string, options: RequestOptions = {}): Promise<Response> {
  for (;;) {
    const access = await getToken()
    const res = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: { ...options.headers, Authorization: `Bearer ${access}` },
    })
    // Token revoked or expired early: sign in again, then retry.
    if (res.status === 401) {
      if (token?.value === access) setToken(null)
      continue
    }
    if (res.ok) return res
    let message = `Google Drive error ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) message += `: ${body.error.message}`
    } catch {
      // Not JSON; the status will do.
    }
    throw new Error(message)
  }
}

// ---- Local copy (IndexedDB) ----

// One record per downloaded file, keyed by Drive file ID. If IndexedDB is unavailable
// (private window, blocked storage) everything still works; it's just downloaded each visit.
type Cached = { id: string; md5: string; bytes: ArrayBuffer }
const DB_NAME = 'driveCache'
const STORE = 'files'

let dbOpen: Promise<IDBDatabase> | null = null
function openDb(): Promise<IDBDatabase> {
  dbOpen ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbOpen
}

async function cacheLoadAll(): Promise<Map<string, Cached>> {
  try {
    const db = await openDb()
    const all = await new Promise<Cached[]>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as Cached[])
      request.onerror = () => reject(request.error)
    })
    return new Map(all.map((c) => [c.id, c]))
  } catch {
    return new Map()
  }
}

// Stores `put` and removes the `remove` IDs. Failures only cost a re-download next visit.
async function cacheWrite(put: Cached[], remove: string[] = []) {
  try {
    const db = await openDb()
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    for (const c of put) store.put(c)
    for (const id of remove) store.delete(id)
  } catch {
    // Storage unavailable.
  }
}

// ---- The Files folder ----

// Only these are downloaded and listed; anything else in the folder is ignored.
const EXTENSIONS = ['.md', '.csv', '.ics']

type Entry = { path: string; id: string; mimeType: string }
type FileEntry = Entry & { md5: string; bytes: ArrayBuffer }
// Keyed by lower-cased path.
const files = new Map<string, FileEntry>()
const folders = new Map<string, Entry>()
let indexLoad: Promise<void> | null = null

type Child = { id: string; name: string; mimeType: string; md5Checksum?: string }

async function listChildren(folderId: string) {
  const children: Child[] = []
  let pageToken = ''
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const res = await driveFetch(
      `${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,md5Checksum)` +
        (pageToken ? `&pageToken=${pageToken}` : ''),
    )
    const page = (await res.json()) as { nextPageToken?: string; files: Child[] }
    children.push(...page.files)
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return children
}

// Adds the folder's subfolders to `folders` and its files (any depth) to `found`.
async function listFolder(folder: Entry, found: (Entry & { md5: string })[]): Promise<void> {
  const children = await listChildren(folder.id)
  await Promise.all(
    children.map((child) => {
      const entry = {
        path: folder.path ? `${folder.path}/${child.name}` : child.name,
        id: child.id,
        mimeType: child.mimeType,
      }
      if (child.mimeType === FOLDER_MIME) {
        folders.set(entry.path.toLowerCase(), entry)
        return listFolder(entry, found)
      }
      // Google Docs/Sheets have no checksum and can't be downloaded as-is; skip them.
      const lower = child.name.toLowerCase()
      if (child.md5Checksum && EXTENSIONS.some((ext) => lower.endsWith(ext)))
        found.push({ ...entry, md5: child.md5Checksum })
    }),
  )
}

// Runs `task` over `items`, at most `limit` at a time (Drive rate-limits bursts).
async function inParallel<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++])
    }),
  )
}

// Finds the Files folder, lists everything in it and downloads whatever isn't already
// stored locally (or changed in Drive since). Waits for sign-in if needed. `onProgress`
// hears how many of the needed downloads are done. Files added in Drive afterwards show
// up after a reload.
export function loadIndex(onProgress?: (done: number, total: number) => void): Promise<void> {
  indexLoad ??= (async () => {
    const q = encodeURIComponent(
      `name = '${ROOT_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`,
    )
    const res = await driveFetch(`${API}/files?q=${q}&fields=files(id)`)
    const roots = ((await res.json()) as { files: { id: string }[] }).files
    if (roots.length === 0)
      throw new Error(`There's no folder named "${ROOT_FOLDER_NAME}" at the top of your Google Drive.`)
    if (roots.length > 1)
      throw new Error(
        `There's more than one folder named "${ROOT_FOLDER_NAME}" at the top of your Google Drive. Rename or remove the extra ones.`,
      )
    files.clear()
    folders.clear()
    const root = { path: '', id: roots[0].id, mimeType: FOLDER_MIME }
    folders.set('', root)
    const found: (Entry & { md5: string })[] = []
    const [cached] = await Promise.all([cacheLoadAll(), listFolder(root, found)])

    const stale = found.filter((f) => cached.get(f.id)?.md5 !== f.md5)
    let done = 0
    onProgress?.(0, stale.length)
    const downloaded = new Map<string, ArrayBuffer>()
    await inParallel(stale, 6, async (f) => {
      const file = await driveFetch(`${API}/files/${f.id}?alt=media`)
      downloaded.set(f.id, await file.arrayBuffer())
      onProgress?.(++done, stale.length)
    })

    for (const f of found)
      files.set(f.path.toLowerCase(), { ...f, bytes: downloaded.get(f.id) ?? cached.get(f.id)!.bytes })
    const ids = new Set(found.map((f) => f.id))
    await cacheWrite(
      stale.map((f) => ({ id: f.id, md5: f.md5, bytes: downloaded.get(f.id)! })),
      [...cached.keys()].filter((id) => !ids.has(id)),
    )
  })().catch((e: unknown) => {
    indexLoad = null // so a retry starts over
    throw e
  })
  return indexLoad
}

// Paths of the files in `folder` (e.g. 'md/Projects') ending in `extension`, including
// subfolders unless `recursive` is false. Call after loadIndex().
export function listFiles(folder: string, extension: string, recursive = true): string[] {
  const prefix = `${folder.toLowerCase()}/`
  return [...files.values()]
    .map((entry) => entry.path)
    .filter((path) => {
      const key = path.toLowerCase()
      return (
        key.startsWith(prefix) &&
        key.endsWith(extension.toLowerCase()) &&
        (recursive || !key.slice(prefix.length).includes('/'))
      )
    })
}

// Paths of the folders below `folder` (e.g. 'md/Projects'), at any depth, including empty
// ones. Call after loadIndex().
export function listFolders(folder: string): string[] {
  const prefix = `${folder.toLowerCase()}/`
  return [...folders.values()]
    .map((entry) => entry.path)
    .filter((path) => path.toLowerCase().startsWith(prefix))
}

// Whether a file or folder exists at `path` (ignoring case).
export function exists(path: string): boolean {
  const key = path.toLowerCase()
  return files.has(key) || folders.has(key)
}

const baseName = (path: string) => path.split('/').pop()!

// Creates an empty folder at `path`; its parent folder must already exist.
export async function createFolder(path: string) {
  const name = baseName(path)
  if (exists(path)) throw new Error(`There's already something named ${name} here.`)
  const parentPath = path.slice(0, path.length - name.length - 1)
  const parent = folders.get(parentPath.toLowerCase())
  if (!parent) throw new Error(`There's no ${parentPath} folder in the Files folder in Google Drive.`)
  const res = await driveFetch(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent.id] }),
  })
  const { id } = (await res.json()) as { id: string }
  folders.set(path.toLowerCase(), { path, id, mimeType: FOLDER_MIME })
}

function find(path: string): FileEntry {
  const entry = files.get(path.toLowerCase())
  if (!entry) throw new Error(`${baseName(path)} isn't in the Files folder in Google Drive.`)
  return entry
}

// A file's contents, from the local copy. Call after loadIndex().
export function readBytes(path: string): ArrayBuffer {
  return find(path).bytes
}

// A file's text, without any byte-order mark.
export function readText(path: string): string {
  return new TextDecoder().decode(readBytes(path)).replace(/^\uFEFF/, '')
}

const MIME_TYPES: Record<string, string> = {
  md: 'text/markdown',
  csv: 'text/csv',
  ics: 'text/calendar',
}

function remember(entry: Entry, md5: string, text: string) {
  const bytes = new TextEncoder().encode(text).buffer as ArrayBuffer
  files.set(entry.path.toLowerCase(), { ...entry, md5, bytes })
  return cacheWrite([{ id: entry.id, md5, bytes }])
}

// Replaces the file at `path` with `text`, but only if it still holds `original` in
// Drive, so edits made elsewhere (another device, Drive itself) aren't overwritten. With
// `original: null` it creates a new file instead, if none has that name.
export async function saveText(path: string, original: string | null, text: string) {
  const name = baseName(path)
  if (original === null) {
    if (exists(path)) throw new Error(`A file named ${name} already exists.`)
    const folderPath = path.slice(0, path.length - name.length - 1)
    const parent = folders.get(folderPath.toLowerCase())
    if (!parent) throw new Error(`There's no ${folderPath} folder in the Files folder in Google Drive.`)
    const mimeType = MIME_TYPES[name.split('.').pop()!.toLowerCase()] ?? 'text/plain'
    const boundary = `boundary-${crypto.randomUUID()}`
    const res = await driveFetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,md5Checksum`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name, parents: [parent.id], mimeType }) +
        `\r\n--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
        text +
        `\r\n--${boundary}--`,
    })
    const { id, md5Checksum } = (await res.json()) as { id: string; md5Checksum: string }
    await remember({ path, id, mimeType }, md5Checksum, text)
    return
  }
  const entry = find(path)
  // Checking the checksum avoids downloading the file just to compare it.
  const res = await driveFetch(`${API}/files/${entry.id}?fields=md5Checksum`)
  const { md5Checksum } = (await res.json()) as { md5Checksum?: string }
  if (md5Checksum !== entry.md5 || readText(path) !== original)
    throw new Error(`${name} changed in Google Drive since it was loaded. Reload to get the latest.`)
  const saved = await driveFetch(`${UPLOAD_API}/files/${entry.id}?uploadType=media&fields=md5Checksum`, {
    method: 'PATCH',
    headers: { 'Content-Type': `${entry.mimeType}; charset=UTF-8` },
    body: text,
  })
  await remember(entry, ((await saved.json()) as { md5Checksum: string }).md5Checksum, text)
}
