import { REPEAT_LABELS, type Repeat } from './events.ts'
import TimeInput from './TimeInput.tsx'

type Props = {
  startTime: string
  repeat: Repeat
  onStartTimeChange: (value: string) => void
  onRepeatChange: (value: Repeat) => void
  // Offer 'Custom' (for an event whose file has a rule the other options can't express).
  showCustom?: boolean
}

// Start time + repeat inputs shared by the create and edit event forms.
function EventTimingFields({
  startTime,
  repeat,
  onStartTimeChange,
  onRepeatChange,
  showCustom = false,
}: Props) {
  return (
    <div className="event-dialog-row">
      <label>
        Start time
        <TimeInput value={startTime} onChange={onStartTimeChange} />
        <span className="event-dialog-hint">
          {startTime ? '' : 'Leave empty for all day'}
        </span>
      </label>
      <label>
        Repeats
        <select
          value={repeat}
          onChange={(e) => onRepeatChange(e.target.value as Repeat)}
        >
          {(Object.keys(REPEAT_LABELS) as Repeat[])
            .filter((option) => option !== 'custom' || showCustom || repeat === 'custom')
            .map((option) => (
            <option key={option} value={option}>
              {REPEAT_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default EventTimingFields
