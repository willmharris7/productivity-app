import ICAL from 'ical.js'
import type { EventInput } from '@fullcalendar/react'
import { CALENDAR_PALETTE, contrastColor } from './calendars.ts'
import { toDateStr, type EventFields, type Repeat } from './events.ts'

// Calendars are the .ics files in the ics folder in Google Drive: one file per calendar, holding one VEVENT
// per event (plus VEVENTs with a RECURRENCE-ID for changed occurrences of a repeating
// one, and the VTIMEZONEs its times refer to). The calendar's name and color are read
// from X-WR-CALNAME and X-APPLE-CALENDAR-COLOR, which Google, Apple and Outlook exports
// use, falling back to the file name and a palette color.

type Component = InstanceType<typeof ICAL.Component>
type Time = InstanceType<typeof ICAL.Time>

const PRODID = '-//productivity-app//Calendar//EN'

export type IcsFile = { file: string; text: string }

// One event as the forms see it: the series (or single event) behind every occurrence.
export type CalendarEvent = EventFields & {
  key: string // `${file}|${uid}`, unique across calendars
  uid: string
  date: string // YYYY-MM-DD of the first occurrence, local time
  event: InstanceType<typeof ICAL.Event>
}

export type Calendar = {
  file: string
  name: string
  color: string
  contrastColor: string
  events: CalendarEvent[]
  error?: string // set when the file couldn't be parsed
}

function parseComponent(text: string): Component {
  const comp = new ICAL.Component(ICAL.parse(text))
  if (comp.name !== 'vcalendar') throw new Error('Not an iCalendar file')
  // Times with a TZID resolve through the global timezone service.
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    const tzid = tz.getFirstPropertyValue('tzid')
    if (typeof tzid === 'string' && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(tz)
    }
  }
  // Events need a UID to be edited; give any without one a stable stand-in, which is
  // written into the file the next time that file is saved.
  comp.getAllSubcomponents('vevent').forEach((vevent, i) => {
    if (!vevent.getFirstPropertyValue('uid')) {
      vevent.addPropertyWithValue('uid', `missing-uid-${i}@productivity-app`)
    }
  })
  return comp
}

function serialize(comp: Component): string {
  const text = comp.toString()
  return text.endsWith('\r\n') ? text : `${text}\r\n`
}

// Masters (no RECURRENCE-ID) and their changed occurrences, grouped by UID.
function groupByUid(comp: Component) {
  const groups = new Map<string, { master?: Component; exceptions: Component[] }>()
  for (const vevent of comp.getAllSubcomponents('vevent')) {
    const uid = String(vevent.getFirstPropertyValue('uid'))
    const group = groups.get(uid) ?? { exceptions: [] }
    if (vevent.hasProperty('recurrence-id')) group.exceptions.push(vevent)
    else group.master ??= vevent
    groups.set(uid, group)
  }
  return groups
}

function displayName(comp: Component, file: string): string {
  const name = comp.getFirstPropertyValue('x-wr-calname') ?? comp.getFirstPropertyValue('name')
  return typeof name === 'string' && name.trim() ? name.trim() : file.replace(/\.ics$/i, '')
}

// 'weekly' / 'monthly' only for the plain rules this app writes (or their equivalents,
// like Google's FREQ=WEEKLY;BYDAY=FR on a Friday event); anything else is 'custom',
// which the forms leave untouched.
function classifyRepeat(vevent: Component, start: Time): Repeat {
  const rules = vevent.getAllProperties('rrule')
  if (rules.length === 0 && !vevent.hasProperty('rdate')) return 'none'
  if (rules.length !== 1 || vevent.hasProperty('rdate')) return 'custom'
  const rule = rules[0].getFirstValue() as InstanceType<typeof ICAL.Recur>
  if (rule.interval !== 1 || rule.count || rule.until) return 'custom'
  const parts = Object.entries(rule.parts).filter(([key]) => key !== 'WKST')
  if (rule.freq === 'WEEKLY') {
    const day = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][start.dayOfWeek() - 1]
    const plain =
      parts.length === 0 ||
      (parts.length === 1 &&
        parts[0][0] === 'BYDAY' &&
        (parts[0][1] as string[]).join() === day)
    return plain ? 'weekly' : 'custom'
  }
  if (rule.freq === 'MONTHLY') {
    const plain =
      parts.length === 0 ||
      (parts.length === 1 &&
        parts[0][0] === 'BYMONTHDAY' &&
        (parts[0][1] as number[]).join() === String(start.day))
    return plain ? 'monthly' : 'custom'
  }
  return 'custom'
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function parseCalendar({ file, text }: IcsFile, index: number): Calendar {
  const fallback = CALENDAR_PALETTE[index % CALENDAR_PALETTE.length]
  let comp: Component
  try {
    comp = parseComponent(text)
  } catch (e) {
    return {
      file,
      name: file.replace(/\.ics$/i, ''),
      color: fallback,
      contrastColor: contrastColor(fallback),
      events: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
  const rawColor = comp.getFirstPropertyValue('x-apple-calendar-color')
  // Apple writes #RRGGBBAA; drop the alpha.
  const color =
    typeof rawColor === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(rawColor)
      ? rawColor.slice(0, 7)
      : fallback

  const events: CalendarEvent[] = []
  for (const [uid, { master, exceptions }] of groupByUid(comp)) {
    // A changed occurrence whose series isn't in this file: show it on its own.
    const main = master ?? exceptions[0]
    const event = new ICAL.Event(main, { exceptions: master ? exceptions : [] })
    const start = event.startDate
    if (!start) continue
    const startDate = start.toJSDate()
    events.push({
      key: `${file}|${uid}`,
      uid,
      title: event.summary ?? '',
      description: event.description ?? '',
      calendar: file,
      startTime: start.isDate ? '' : hhmm(startDate),
      repeat: classifyRepeat(main, start),
      date: start.isDate ? toDateStr(new Date(start.year, start.month - 1, start.day)) : toDateStr(startDate),
      event,
    })
  }
  return { file, name: displayName(comp, file), color, contrastColor: contrastColor(color), events }
}

// A JS Date for an ICAL.Time; all-day dates become local midnight.
function toDate(time: Time): Date {
  return time.isDate ? new Date(time.year, time.month - 1, time.day) : time.toJSDate()
}

function isCancelled(vevent: Component): boolean {
  return String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
}

// Safety cap on how many occurrences of one series are walked per visible range.
const MAX_OCCURRENCES = 20000

// Turn the visible calendars' events into FullCalendar events for [rangeStart, rangeEnd).
export function expandEvents(
  calendars: Calendar[],
  rangeStart: Date,
  rangeEnd: Date,
): EventInput[] {
  const out: EventInput[] = []
  for (const calendar of calendars) {
    const colors = { color: calendar.color, contrastColor: calendar.contrastColor }
    for (const ev of calendar.events) {
      const push = (start: Time, end: Time | null, item: InstanceType<typeof ICAL.Event>) => {
        if (isCancelled(item.component)) return
        const startDate = toDate(start)
        let endDate = end ? toDate(end) : null
        if (endDate && endDate <= startDate) endDate = null
        const lastMoment = endDate ?? new Date(startDate.getTime() + (start.isDate ? 86400000 : 1))
        if (startDate >= rangeEnd || lastMoment <= rangeStart) return
        out.push({
          id: `${ev.key}|${startDate.toISOString()}`,
          title: item.summary ?? '',
          start: start.isDate ? toDateStr(startDate) : startDate,
          end: endDate ? (start.isDate ? toDateStr(endDate) : endDate) : undefined,
          allDay: start.isDate,
          ...colors,
          extendedProps: { eventId: ev.key },
        })
      }

      if (!ev.event.isRecurring()) {
        push(ev.event.startDate, ev.event.endDate ?? null, ev.event)
        continue
      }
      const iterator = ev.event.iterator()
      for (let i = 0, next: Time | null; i < MAX_OCCURRENCES && (next = iterator.next()); i++) {
        const details = ev.event.getOccurrenceDetails(next)
        // Changed occurrences can move, so look a little past the range before stopping.
        if (toDate(next).getTime() >= rangeEnd.getTime() + 31 * 86400000) break
        push(details.startDate, details.endDate ?? null, details.item)
      }
    }
  }
  return out
}

// --- Editing ----------------------------------------------------------------------

function stamp(vevent: Component) {
  const now = ICAL.Time.fromJSDate(new Date(), true)
  vevent.updatePropertyWithValue('dtstamp', now)
  vevent.updatePropertyWithValue('last-modified', now)
}

function setText(vevent: Component, name: string, value: string) {
  if (value) vevent.updatePropertyWithValue(name, value)
  else vevent.removeAllProperties(name)
}

function floating(data: ConstructorParameters<typeof ICAL.Time>[0]): Time {
  return new ICAL.Time(data, ICAL.Timezone.localTimezone)
}

function nextDay(date: Time): Time {
  const end = date.clone()
  end.adjust(1, 0, 0, 0)
  return end
}

// Writes the form's fields onto a VEVENT. The date stays where it is (the forms don't
// change it); a changed start time keeps the event's time zone and length.
function applyFields(vevent: Component, fields: EventFields, date: string, oldRepeat: Repeat) {
  const event = new ICAL.Event(vevent)
  setText(vevent, 'summary', fields.title)
  setText(vevent, 'description', fields.description)

  const old = event.startDate
  const hadEnd = vevent.hasProperty('dtend')
  const oldLength = hadEnd && old ? event.endDate.subtractDateTz(old) : null
  const [y, m, d] = date.split('-').map(Number)
  let start: Time
  if (!fields.startTime) {
    start = floating({ year: y, month: m, day: d, isDate: true })
  } else {
    const [hour, minute] = fields.startTime.split(':').map(Number)
    const zone = old && !old.isDate ? old.zone : null
    if (zone && zone.tzid !== 'floating') {
      // Same wall-clock time here, expressed in the event's own zone (UTC or a TZID).
      const local = ICAL.Time.fromJSDate(new Date(y, m - 1, d, hour, minute), true)
      start = zone.tzid === 'UTC' ? local : local.convertToZone(zone)
    } else {
      start = floating({ year: y, month: m, day: d, hour, minute, second: 0 })
    }
  }
  event.startDate = start

  const sameKind = old && old.isDate === start.isDate
  if (hadEnd && sameKind && oldLength) {
    const end = start.clone()
    end.addDuration(oldLength)
    event.endDate = end
  } else if (!vevent.hasProperty('duration')) {
    vevent.removeAllProperties('dtend')
    // All-day events end the next day (exclusive), as calendar apps expect.
    if (start.isDate) event.endDate = nextDay(start)
  }

  if (fields.repeat !== oldRepeat && fields.repeat !== 'custom') {
    vevent.removeAllProperties('rrule')
    if (fields.repeat === 'none') {
      vevent.removeAllProperties('rdate')
      vevent.removeAllProperties('exdate')
    } else {
      vevent.addPropertyWithValue(
        'rrule',
        ICAL.Recur.fromString(fields.repeat === 'weekly' ? 'FREQ=WEEKLY' : 'FREQ=MONTHLY'),
      )
    }
  }
  const sequence = Number(vevent.getFirstPropertyValue('sequence') ?? 0)
  vevent.updatePropertyWithValue('sequence', sequence + 1)
  stamp(vevent)
}

// A new, empty calendar file.
export function newCalendarText(name: string, color: string): string {
  const comp = new ICAL.Component('vcalendar')
  comp.addPropertyWithValue('version', '2.0')
  comp.addPropertyWithValue('prodid', PRODID)
  comp.addPropertyWithValue('calscale', 'GREGORIAN')
  comp.addPropertyWithValue('x-wr-calname', name)
  comp.addPropertyWithValue('x-apple-calendar-color', color)
  return serialize(comp)
}

export function addEvent(text: string, fields: EventFields, date: string): string {
  const comp = parseComponent(text)
  const vevent = new ICAL.Component('vevent')
  vevent.addPropertyWithValue('uid', `${crypto.randomUUID()}@productivity-app`)
  comp.addSubcomponent(vevent)
  applyFields(vevent, fields, date, 'none')
  vevent.updatePropertyWithValue('sequence', 0)
  vevent.updatePropertyWithValue('created', vevent.getFirstPropertyValue('dtstamp'))
  return serialize(comp)
}

export function updateEvent(text: string, uid: string, fields: EventFields, date: string, oldRepeat: Repeat): string {
  const comp = parseComponent(text)
  const group = groupByUid(comp).get(uid)
  const vevent = group?.master ?? group?.exceptions[0]
  if (!vevent) throw new Error('That event is no longer in the file.')
  const oldStart = new ICAL.Event(vevent).startDate?.clone()
  applyFields(vevent, fields, date, oldRepeat)
  // A new start time moves every occurrence, so the RECURRENCE-IDs of changed
  // occurrences and the skipped EXDATEs have to move with it to keep matching.
  const newStart = new ICAL.Event(vevent).startDate
  if (group?.master && oldStart && newStart && oldStart.isDate === newStart.isDate) {
    const shift = newStart.subtractDateTz(oldStart)
    if (shift.toSeconds() !== 0) {
      const move = (time: Time) => {
        const moved = time.clone()
        moved.addDuration(shift)
        return moved
      }
      for (const exception of group.exceptions) {
        const prop = exception.getFirstProperty('recurrence-id')
        if (prop) prop.setValue(move(prop.getFirstValue() as Time))
      }
      for (const prop of vevent.getAllProperties('exdate')) {
        prop.setValues(prop.getValues().map((time: Time) => move(time)))
      }
    }
  }
  return serialize(comp)
}

// Removes every VEVENT with this UID; returns them too, for moving to another calendar.
export function removeEvent(text: string, uid: string): { text: string; removed: Component[]; timezones: Component[] } {
  const comp = parseComponent(text)
  const removed = comp
    .getAllSubcomponents('vevent')
    .filter((vevent) => String(vevent.getFirstPropertyValue('uid')) === uid)
  removed.forEach((vevent) => comp.removeSubcomponent(vevent))
  // The VTIMEZONEs those events refer to, so the target file can resolve their times.
  const tzids = new Set(
    removed.flatMap((vevent) =>
      vevent.getAllProperties().map((prop) => prop.getParameter('tzid')).filter((t): t is string => typeof t === 'string'),
    ),
  )
  const timezones = comp
    .getAllSubcomponents('vtimezone')
    .filter((tz) => tzids.has(String(tz.getFirstPropertyValue('tzid'))))
  return { text: serialize(comp), removed, timezones }
}

export function insertEvents(text: string, vevents: Component[], timezones: Component[]): string {
  const comp = parseComponent(text)
  const have = new Set(comp.getAllSubcomponents('vtimezone').map((tz) => String(tz.getFirstPropertyValue('tzid'))))
  for (const tz of timezones) {
    if (!have.has(String(tz.getFirstPropertyValue('tzid')))) comp.addSubcomponent(new ICAL.Component(tz.toJSON()))
  }
  for (const vevent of vevents) comp.addSubcomponent(new ICAL.Component(vevent.toJSON()))
  return serialize(comp)
}
