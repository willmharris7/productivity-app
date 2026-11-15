import { useLayoutEffect, useRef } from 'react'

const BULLET = '• '
const INDENT = '    '
// Leading spaces, then a bullet.
const BULLET_LINE = /^( *)• /

type Props = {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

// Start/end offsets of the line containing `pos`.
function lineBounds(value: string, pos: number) {
  const start = value.lastIndexOf('\n', pos - 1) + 1
  const endIdx = value.indexOf('\n', pos)
  return { start, end: endIdx === -1 ? value.length : endIdx }
}

// Plain-text notes with markdown-style bullets:
// - "- " at the start of a line (after any indent) becomes "• "
// - Enter on a bullet line starts a new bullet at the same indent; Enter on an
//   empty bullet outdents it, or ends the list if it isn't indented
// - Tab / Shift+Tab indents / outdents the bullet line(s) under the cursor
// - Backspace right after a bullet outdents it, or removes it if it isn't indented
function NotesTextarea({ value, onChange, className, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Selection to restore after React re-renders with rewritten text.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    if (pendingSelection.current && ref.current) {
      const { start, end } = pendingSelection.current
      ref.current.setSelectionRange(start, end)
      pendingSelection.current = null
    }
  })

  const update = (next: string, start: number, end = start) => {
    pendingSelection.current = { start, end }
    onChange(next)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Same length replacement, so the caret position stays valid.
    update(
      e.target.value.replace(/^( *)- /gm, `$1${BULLET}`),
      e.target.selectionStart,
      e.target.selectionEnd,
    )
  }

  // Remove up to one indent level from the line starting at lineStart.
  const outdentAt = (lineStart: number, caret: number) => {
    const spaces = BULLET_LINE.exec(value.slice(lineStart))?.[1].length ?? 0
    const remove = Math.min(spaces, INDENT.length)
    update(
      value.slice(0, lineStart) + value.slice(lineStart + remove),
      caret - remove,
    )
  }

  const handleTab = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    start: number,
    end: number,
  ) => {
    // All lines touched by the selection.
    const blockStart = lineBounds(value, start).start
    const blockEnd = lineBounds(value, end).end
    const lines = value.slice(blockStart, blockEnd).split('\n')
    if (!lines.some((line) => BULLET_LINE.test(line))) return // normal Tab
    e.preventDefault()

    let firstDelta = 0
    let totalDelta = 0
    const changed = lines.map((line, i) => {
      if (!BULLET_LINE.test(line)) return line
      const spaces = BULLET_LINE.exec(line)![1].length
      const next = e.shiftKey
        ? line.slice(Math.min(spaces, INDENT.length))
        : INDENT + line
      const delta = next.length - line.length
      if (i === 0) firstDelta = delta
      totalDelta += delta
      return next
    })

    update(
      value.slice(0, blockStart) + changed.join('\n') + value.slice(blockEnd),
      Math.max(blockStart, start + firstDelta),
      end + totalDelta,
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const { selectionStart: start, selectionEnd: end } = e.currentTarget

    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      handleTab(e, start, end)
      return
    }

    const line = lineBounds(value, start)
    const match = BULLET_LINE.exec(value.slice(line.start, line.end))
    if (!match) return
    const [prefix, indent] = match

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.slice(line.start, line.end) === prefix) {
        // Empty bullet: outdent it, or drop it and end the list.
        if (indent) {
          outdentAt(line.start, start)
        } else {
          update(
            value.slice(0, line.start) + value.slice(line.start + BULLET.length),
            line.start,
          )
        }
      } else {
        const insert = '\n' + indent + BULLET
        update(
          value.slice(0, start) + insert + value.slice(end),
          start + insert.length,
        )
      }
    } else if (
      e.key === 'Backspace' &&
      start === end &&
      start === line.start + prefix.length
    ) {
      e.preventDefault()
      if (indent) {
        outdentAt(line.start, start)
      } else {
        update(
          value.slice(0, line.start) + value.slice(line.start + BULLET.length),
          line.start,
        )
      }
    }
  }

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  )
}

export default NotesTextarea
