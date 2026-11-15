import FullCalendar, { useCalendarController } from '@fullcalendar/react'
import classicThemePlugin from '@fullcalendar/react/themes/classic'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import interactionPlugin from '@fullcalendar/react/interaction'

import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import type {
  DateClickInfo,
  DatesSetInfo,
  EventClickInfo,
} from '@fullcalendar/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import Tasks from './Tasks.tsx'
import CalendarsMenu from './CalendarsMenu.tsx'
import EventDialog from './EventDialog.tsx'
import EventDetailsDialog from './EventDetailsDialog.tsx'
import SourcesScreen from './SourcesScreen.tsx'
import NotesScreen from './NotesScreen.tsx'
import LibraryScreen from './LibraryScreen.tsx'
import MdFolderScreen from './MdFolderScreen.tsx'
import NewCalendarDialog from './NewCalendarDialog.tsx'
import { CALENDAR_PALETTE, DEFAULT_CALENDAR } from './calendars.ts'
import { toDateStr, type EventFields } from './events.ts'
import { expandEvents } from './ics.ts'
import useIcsCalendars from './useIcsCalendars.ts'

// Bottom-left navigation, a 3-column x 2-row grid listed row by row:
//   Calendar | Library | Projects
//   Events   | Info    | Social
// Every item switches the main screen.
// 'notes' isn't in the nav; it's opened from the Notes button in the Tasks header.
type Screen =
  | 'calendar'
  | 'library'
  | 'sources'
  | 'projects'
  | 'info'
  | 'social'
  | 'notes'
const NAV_ITEMS: { name: string; screen?: Screen }[] = [
  { name: 'Calendar', screen: 'calendar' },
  { name: 'Library', screen: 'library' },
  { name: 'Projects', screen: 'projects' },
  { name: 'Events', screen: 'sources' },
  { name: 'Info', screen: 'info' },
  { name: 'Social', screen: 'social' },
]

// Two clicks on the same day within this window count as a double-click.
const DOUBLE_CLICK_MS = 400

function App() {
  const calendarRef = useRef<HTMLElement>(null)
  const [menuPosition, setMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  // File names of calendars unticked in the Calendars menu (all start ticked).
  const [hiddenCalendars, setHiddenCalendars] = useState<string[]>([])
  const [newCalendarOpen, setNewCalendarOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuPosition(null), [])

  // Which screen fills the main area: the calendar, or a panel opened from the left.
  const [mainScreen, setMainScreen] = useState<Screen>(
    'calendar',
  )
  // Bumped on every nav click; remounting a notes screen (Projects, Social, Info)
  // returns it to the top level, even when it's already showing.
  // Library uses it too, to go back from an open CSV to the list of files.
  const [navVisit, setNavVisit] = useState(0)

  // Calendars and their events, loaded from (and saved into) the .ics files in ics in Google Drive.
  const {
    calendars,
    error: calendarError,
    clearError: clearCalendarError,
    addEvent,
    updateEvent,
    deleteEvent,
    createCalendar,
  } = useIcsCalendars()
  const writableCalendars = calendars.filter((calendar) => !calendar.error)
  const defaultCalendar =
    writableCalendars.find((calendar) => calendar.name === DEFAULT_CALENDAR)
      ?.file ?? writableCalendars[0]?.file
  // Date range currently on screen; repeating events are expanded only within it.
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null)
  const [newEventDay, setNewEventDay] = useState<{
    date: Date
    dateStr: string
  } | null>(null)
  const lastClick = useRef<{ dateStr: string; time: number } | null>(null)

  const controller = useCalendarController()
  // Day highlighted by a single click in month view (YYYY-MM-DD).
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Week/Day buttons: when leaving month view with a highlighted day, open the
  // week containing it (or that day) instead of the month's current date.
  const viewButtonClick = (viewType: string) => (ev: MouseEvent) => {
    if (!selectedDay || controller.view?.type !== 'dayGridMonth') return
    ev.preventDefault()
    controller.changeView(viewType)
    controller.gotoDate(selectedDay)
  }

  // FullCalendar has no double-click option, so detect two quick clicks on the same day.
  const handleDateClick = (info: DateClickInfo) => {
    if (info.view.type !== 'dayGridMonth') return
    setSelectedDay(info.dateStr)
    const now = Date.now()
    const prev = lastClick.current
    if (
      prev &&
      prev.dateStr === info.dateStr &&
      now - prev.time < DOUBLE_CLICK_MS
    ) {
      lastClick.current = null
      // Events need a calendar file to go in.
      if (defaultCalendar) {
        setNewEventDay({ date: info.date, dateStr: info.dateStr })
      } else {
        setNewCalendarOpen(true)
      }
    } else {
      lastClick.current = { dateStr: info.dateStr, time: now }
    }
  }

  // The saved event behind the double-clicked occurrence, plus that occurrence's date.
  const [viewedEvent, setViewedEvent] = useState<{
    id: string
    date: Date | null
  } | null>(null)
  const viewedStored = viewedEvent
    ? calendars
        .flatMap((calendar) => calendar.events)
        .find((event) => event.key === viewedEvent.id)
    : undefined
  const lastEventClick = useRef<{ id: string; time: number } | null>(null)

  // Same double-click detection as days, but keyed on the clicked event.
  const handleEventClick = (info: EventClickInfo) => {
    const now = Date.now()
    const prev = lastEventClick.current
    if (prev && prev.id === info.event.id && now - prev.time < DOUBLE_CLICK_MS) {
      lastEventClick.current = null
      setViewedEvent({
        id: String(info.event.extendedProps.eventId),
        date: info.event.start,
      })
    } else {
      lastEventClick.current = { id: info.event.id, time: now }
    }
  }

  const updateViewedEvent = (fields: EventFields) => {
    if (!viewedStored) return
    updateEvent(viewedStored, fields)
    // Moving it to another calendar changes its key; keep the dialog on it.
    if (fields.calendar !== viewedStored.calendar && viewedEvent) {
      setViewedEvent({
        ...viewedEvent,
        id: `${fields.calendar}|${viewedStored.uid}`,
      })
    }
  }

  const deleteViewedEvent = () => {
    if (!viewedStored) return
    deleteEvent(viewedStored)
    setViewedEvent(null)
  }

  const saveEvent = (fields: EventFields) => {
    if (!newEventDay) return
    addEvent(fields, newEventDay.dateStr)
    setNewEventDay(null)
  }

  const saveNewCalendar = (name: string, color: string) => {
    if (createCalendar(name, color)) setNewCalendarOpen(false)
  }

  // Only events in calendars ticked in the Calendars menu (nothing ticked shows no
  // events). Memoized: repeating events are expanded by walking their rules.
  const visibleEvents = useMemo(
    () =>
      range
        ? expandEvents(
            calendars.filter(
              (calendar) => !hiddenCalendars.includes(calendar.file),
            ),
            range.start,
            range.end,
          )
        : [],
    [calendars, hiddenCalendars, range],
  )

  return (
    <main className="layout">
      <Tasks
        notesOpen={mainScreen === 'notes'}
        // Toggles: clicking Notes again returns to the calendar.
        onNotesClick={() =>
          setMainScreen(mainScreen === 'notes' ? 'calendar' : 'notes')
        }
      />
      <nav className="main-nav">
        {NAV_ITEMS.map(({ name, screen }) => (
          <button
            key={name}
            type="button"
            className={`panel nav-button${
              screen && screen === mainScreen ? ' active' : ''
            }`}
            aria-current={screen && screen === mainScreen ? 'page' : undefined}
            onClick={() => {
              if (screen) setMainScreen(screen)
              setNavVisit((n) => n + 1)
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {mainScreen === 'notes' && <NotesScreen />}
      {mainScreen === 'library' && <LibraryScreen key={`library-${navVisit}`} />}
      {mainScreen === 'sources' && (
        <SourcesScreen />
      )}
      {mainScreen === 'projects' && (
        <MdFolderScreen
          key={`projects-${navVisit}`}
          title="Projects"
        />
      )}
      {mainScreen === 'social' && (
        <MdFolderScreen
          key={`social-${navVisit}`}
          title="Social"
        />
      )}
      {mainScreen === 'info' && (
        <MdFolderScreen
          key={`info-${navVisit}`}
          title="Info"
        />
      )}
      {/* Hidden rather than unmounted, so the calendar keeps its view and date. */}
      <section
        className="calendar"
        ref={calendarRef}
        hidden={mainScreen !== 'calendar'}
      >
        <FullCalendar
          plugins={[
            classicThemePlugin,
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          buttons={{
            calendars: {
              text: 'Calendars',
              className: 'calendars-button',
              click: (ev) => {
                if (menuPosition) {
                  closeMenu()
                  return
                }
                // Anchor the menu just below the button, relative to the calendar panel.
                const button =
                  (ev.target as Element).closest('button') ??
                  (ev.target as Element)
                const buttonRect = button.getBoundingClientRect()
                const panelRect = calendarRef.current!.getBoundingClientRect()
                setMenuPosition({
                  top: buttonRect.bottom - panelRect.top + 4,
                  left: buttonRect.left - panelRect.left,
                })
              },
            },
            timeGridWeek: { click: viewButtonClick('timeGridWeek') },
            timeGridDay: { click: viewButtonClick('timeGridDay') },
          }}
          controller={controller}
          headerToolbar={{
            start: 'calendars',
            center: 'title',
            end: 'prev,next today dayGridMonth,timeGridWeek,timeGridDay',
          }}
          height="100%"
          // Cap events at whatever fits in the day cell so rows never grow;
          // overflow is replaced by an event-style "..." bar (opens the full list).
          // Month view only: week and day views show every event.
          views={{
            dayGridMonth: {
              dayMaxEvents: true,
              dayCellClass: (info) =>
                toDateStr(info.date) === selectedDay ? 'selected-day' : '',
            },
          }}
          dayMaxEvents={false}
          // Event times as "9am" / "2:30pm" (month view defaults to "9a" / "2:30p").
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            omitZeroMinute: true,
            meridiem: 'short',
          }}
          moreLinkContent="..."
          moreLinkClass="more-events-bar"
          events={visibleEvents}
          datesSet={(info: DatesSetInfo) =>
            setRange({ start: info.start, end: info.end })
          }
          dateClick={handleDateClick}
          eventClick={handleEventClick}
        />
        {menuPosition && (
          <CalendarsMenu
            position={menuPosition}
            calendars={calendars}
            hidden={hiddenCalendars}
            onChange={setHiddenCalendars}
            onNewCalendar={() => {
              closeMenu()
              setNewCalendarOpen(true)
            }}
            onClose={closeMenu}
          />
        )}
        {calendarError && !newCalendarOpen && (
          <div className="calendar-error" role="alert">
            {calendarError}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={clearCalendarError}
            >
              ×
            </button>
          </div>
        )}
      </section>
      {newCalendarOpen && (
        <NewCalendarDialog
          initialColor={
            CALENDAR_PALETTE[calendars.length % CALENDAR_PALETTE.length]
          }
          error={calendarError}
          onSave={saveNewCalendar}
          onClose={() => {
            setNewCalendarOpen(false)
            clearCalendarError()
          }}
        />
      )}
      {newEventDay && defaultCalendar && (
        <EventDialog
          date={newEventDay.date}
          calendars={writableCalendars}
          defaultCalendar={defaultCalendar}
          onSave={saveEvent}
          onClose={() => setNewEventDay(null)}
        />
      )}
      {viewedEvent && viewedStored && (
        <EventDetailsDialog
          calendars={writableCalendars}
          title={viewedStored.title}
          description={viewedStored.description}
          calendar={viewedStored.calendar}
          startTime={viewedStored.startTime}
          repeat={viewedStored.repeat}
          date={viewedEvent.date}
          onSave={updateViewedEvent}
          onDelete={deleteViewedEvent}
          onClose={() => setViewedEvent(null)}
        />
      )}
    </main>
  )
}

export default App
