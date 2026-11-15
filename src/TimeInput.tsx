import { useState } from 'react'

type Period = 'AM' | 'PM'

type Props = {
  value: string // 'HH:MM' (24-hour), or '' for no time
  onChange: (value: string) => void
}

function parse(value: string): { hour: string; minute: string; period: Period } {
  if (!value) return { hour: '', minute: '', period: 'AM' }
  const [h, m] = value.split(':').map(Number)
  return {
    hour: String(h % 12 === 0 ? 12 : h % 12),
    minute: String(m).padStart(2, '0'),
    period: h >= 12 ? 'PM' : 'AM',
  }
}

// 12-hour time entry: hour and minute boxes plus an AM/PM button.
// AM is the default; clicking the button flips between AM and PM.
function TimeInput({ value, onChange }: Props) {
  const initial = parse(value)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [period, setPeriod] = useState<Period>(initial.period)

  // Report a 24-hour 'HH:MM' upward, or '' while no valid hour is entered.
  const emit = (h: string, m: string, p: Period) => {
    const hourNum = Number(h)
    if (!h || hourNum < 1 || hourNum > 12) {
      onChange('')
      return
    }
    const minuteNum = Math.min(Number(m) || 0, 59)
    const hour24 = (hourNum % 12) + (p === 'PM' ? 12 : 0)
    onChange(
      `${String(hour24).padStart(2, '0')}:${String(minuteNum).padStart(2, '0')}`,
    )
  }

  const digits = (s: string) => s.replace(/\D/g, '').slice(0, 2)

  const clear = () => {
    setHour('')
    setMinute('')
    setPeriod('AM')
    onChange('')
  }

  return (
    <span className="time-input">
      <input
        inputMode="numeric"
        placeholder="hh"
        aria-label="Hour"
        value={hour}
        onChange={(e) => {
          const h = digits(e.target.value)
          setHour(h)
          emit(h, minute, period)
        }}
      />
      <span aria-hidden="true">:</span>
      <input
        inputMode="numeric"
        placeholder="mm"
        aria-label="Minute"
        value={minute}
        onChange={(e) => {
          const m = digits(e.target.value)
          setMinute(m)
          emit(hour, m, period)
        }}
        onBlur={() => {
          if (minute) setMinute(String(Math.min(Number(minute), 59)).padStart(2, '0'))
        }}
      />
      <button
        type="button"
        className="time-input-period"
        aria-label={`${period}, click to switch to ${period === 'AM' ? 'PM' : 'AM'}`}
        onClick={() => {
          const p = period === 'AM' ? 'PM' : 'AM'
          setPeriod(p)
          emit(hour, minute, p)
        }}
      >
        {period}
      </button>
      {(hour || minute) && (
        <button
          type="button"
          className="event-dialog-clear"
          aria-label="Clear start time"
          onClick={clear}
        >
          ×
        </button>
      )}
    </span>
  )
}

export default TimeInput
