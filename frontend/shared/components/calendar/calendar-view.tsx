'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  createViewDay,
  createViewMonthGrid,
  createViewWeek,
} from '@schedule-x/calendar';
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls';
// Side-effect import: installs `Temporal` on `globalThis`. Schedule-X
// v4.6+ does `event.start instanceof Temporal.ZonedDateTime` against
// the global `Temporal` (it doesn't import the polyfill itself), so
// without this side effect the instanceof check throws even when our
// instances are structurally correct. The named import below pulls
// from the SAME polyfill the global side-effect installs, so both
// references resolve to one constructor.
import 'temporal-polyfill/global';
import { Temporal } from 'temporal-polyfill';
import '@schedule-x/theme-default/dist/index.css';

// ─── Public types ──────────────────────────────────────────────────────

export interface CalendarViewEvent<TPayload = unknown> {
  /** Stable id — used as the React key and as the click-back lookup. */
  id: string;
  /** Short label rendered in the event chip. */
  title: string;
  /** Start instant. Accepts an ISO 8601 string OR a Date. */
  start: string | Date;
  /** End instant. Same format as `start`. */
  end: string | Date;
  /**
   * Optional calendar id used to pick a colour from the `calendars`
   * palette. If omitted (or unrecognised), Schedule-X falls back to its
   * own default. We add no styling of our own beyond the palette so
   * callers stay in control of the look.
   */
  calendarId?: string;
  /** Optional sub-label shown in the day-view event details. */
  description?: string;
  /**
   * Arbitrary domain payload echoed back via `onEventClick`. Lets the
   * caller resolve the click target without an extra lookup table.
   */
  payload?: TPayload;
}

export interface CalendarColorSet {
  /** Primary stroke / chip text colour. */
  main: string;
  /** Background container colour. */
  container: string;
  /** Foreground colour inside the container. */
  onContainer: string;
}

export interface CalendarColorPalette {
  /** Unique colour-namespace id used by Schedule-X internally. */
  colorName: string;
  lightColors: CalendarColorSet;
  darkColors?: CalendarColorSet;
}

export type CalendarViewKind = 'day' | 'week' | 'month';

export interface CalendarViewProps<TPayload = unknown> {
  /**
   * Events to render. The shape is library-agnostic — the component
   * converts to Schedule-X's `YYYY-MM-DD HH:mm` string format
   * internally using the supplied `timezone`.
   */
  events: CalendarViewEvent<TPayload>[];
  /**
   * Colour palettes keyed by `calendarId`. Missing keys fall back to
   * Schedule-X defaults. Use `CALENDAR_PRESET_COLORS` for RDS-aligned
   * options.
   */
  calendars?: Record<string, CalendarColorPalette>;
  /** Which views the user can switch between. Default: all three. */
  views?: CalendarViewKind[];
  /** Initial view. Default: 'week'. */
  defaultView?: CalendarViewKind;
  /**
   * IANA timezone for displaying events. Default: 'Asia/Kolkata'
   * (matches RecriAuth's operating timezone). The component takes raw
   * UTC instants in `events` and renders them in this timezone — every
   * admin sees the same grid regardless of their browser's tz.
   */
  timezone?: string;
  /**
   * Fired with the original event (including its `payload`) when the
   * admin clicks an event chip.
   */
  onEventClick?: (event: CalendarViewEvent<TPayload>) => void;
  /**
   * Optional controlled date — when set, the calendar programmatically
   * navigates to this date (jumps the visible week / month grid).
   * Used by the sidebar mini-calendar to drive the main view.
   */
  selectedDate?: string | Date;
  /**
   * Optional controlled view — when set, the calendar switches to
   * this view via the controls plugin. Used by callers that render a
   * custom toolbar (Day/Week/Month dropdown) and need the calendar to
   * follow their selection.
   */
  currentView?: CalendarViewKind;
  /**
   * When true, hides Schedule-X's default top header (Today + nav +
   * date label + view dropdown). Use this when you're rendering a
   * custom toolbar above the calendar so the two don't compete.
   */
  hideDefaultHeader?: boolean;
  /**
   * Max event chips shown per day in month view before a "+N more"
   * link appears. Library default is 4; we expose it so callers can
   * tighten it (e.g. 2) and pair it with `onClickPlusEvents` to render
   * a custom overflow popover.
   */
  nEventsPerDay?: number;
  /**
   * Fired when the user clicks the "+N more" link in month view.
   * Receives the date string (YYYY-MM-DD) of that cell and the source
   * mouse event so the caller can anchor a popover relative to the
   * clicked button (`(event.currentTarget as HTMLElement).getBoundingClientRect()`).
   */
  onClickPlusEvents?: (date: string, mouseEvent: MouseEvent) => void;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /**
   * Visible time-grid window for day + week views, as whole-hour
   * `HH:00` strings (schedule-x validates against /^\d{2}:00$/, so
   * minutes other than `:00` will throw at init). Defaults to
   * 10:00 → 19:00 — overridden by callers that want the grid to
   * follow a workspace setting (e.g. internal verification-schedule
   * uses the working-hours config).
   */
  dayBoundaries?: { start: string; end: string };
}

// ─── RDS-aligned palette presets ───────────────────────────────────────
//
// Caller-friendly shortcuts so domains don't re-derive hex colours from
// the design tokens. Drop them into the `calendars` prop directly:
//
//   <CalendarView calendars={{
//     scheduled: CALENDAR_PRESET_COLORS.primary,
//     verified:  CALENDAR_PRESET_COLORS.success,
//   }} ... />

// Mirrors the RDS Tag/Chip palette (see shared/components/ui/tag.tsx).
// Schedule-X renders an event chip as:
//   border-inline-start: 4px solid var(--sx-color-${name})   ← `main`
//   background-color:           var(--sx-color-${name}-container)   ← `container`
//   color:                      var(--sx-color-on-${name}-container) ← `onContainer`
// So `main` = the 4 px left bar, `container` = chip background, and
// `onContainer` = chip text. To match the Tag variants exactly:
//   primary → Tag "Info"    (bg-primary-200,    text-primary)
//   success → Tag "Success" (bg-surface-success, text-success)
//   warning → Tag "Warning" (bg-surface-warning, text-warning)
export const CALENDAR_PRESET_COLORS = {
  primary: {
    colorName: 'rds-primary',
    lightColors: {
      main: '#174ab5', // --color-primary / Color-Surface-Primary-Info
      container: '#e8edf8', // --color-primary-200 (Tag Info bg)
      onContainer: '#174ab5', // text-primary
    },
  },
  success: {
    colorName: 'rds-success',
    lightColors: {
      main: '#2fab5d', // --color-success / Success-Default
      container: '#eaf7ef', // --color-success-100 (Tag Success bg)
      onContainer: '#2fab5d', // text-success
    },
  },
  warning: {
    colorName: 'rds-warning',
    lightColors: {
      main: '#ffb522', // --color-warning / Warning-Default
      container: '#fff9ec', // --color-warning-100 (Tag Warning bg)
      onContainer: '#ffb522', // text-warning
    },
  },
  failure: {
    colorName: 'rds-failure',
    lightColors: {
      main: '#e33939', // --color-failure
      container: '#fcebeb', // --color-failure-100
      onContainer: '#e33939', // text-failure
    },
  },
  // Subdued / passive — reads as "neutral state, no alarm". Used by
  // the Missed bucket: a missed call didn't go wrong (no red), but
  // the slot is no longer actionable either. Grey conveys both.
  subdued: {
    colorName: 'rds-subdued',
    lightColors: {
      main: 'var(--color-neutral-700)', // --color-text-subheading / --color-neutral-700
      container: '#f3f4f7', // --color-neutral-300
      onContainer: 'var(--color-neutral-700)',
    },
  },
} as const satisfies Record<string, CalendarColorPalette>;

// ─── Internals ─────────────────────────────────────────────────────────

const VIEW_FACTORIES: Record<CalendarViewKind, () => unknown> = {
  day: createViewDay,
  week: createViewWeek,
  month: createViewMonthGrid,
};

/**
 * Schedule-X v4.6+ requires event start/end as `Temporal.ZonedDateTime`
 * instances (or `Temporal.PlainDate` for all-day events). It bundles
 * `temporal-polyfill`; we import the same package so our instances are
 * structurally compatible.
 *
 * UTC instant → ZonedDateTime in the displayed timezone. The wall-
 * clock projection is handled by Temporal — every admin sees the same
 * grid regardless of the browser's tz.
 */
// Renders an hour-of-day as "10 AM" / "7 PM" — same compact format
// schedule-x uses for its built-in hour labels, so the end-of-day
// pseudo-element label below visually matches the rest of the axis.
function formatHourLabel(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) return '';
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function toZonedDateTime(
  value: string | Date,
  timezone: string,
): Temporal.ZonedDateTime {
  const epochMs = (value instanceof Date ? value : new Date(value)).getTime();
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(
    timezone,
  );
}

/**
 * Generic month / week / day calendar built on Schedule-X. Library
 * concerns (date-string format, view factories, events-service plugin)
 * stay here; callers pass plain event objects and styling palettes.
 *
 * Where to extend:
 *   - new view kinds → add to `CalendarViewKind` + `VIEW_FACTORIES`
 *   - drag-to-reschedule → install `@schedule-x/drag-and-drop`, add a
 *     `onEventUpdate` prop here, register the plugin alongside
 *     `eventsService` below
 *   - mini sidebar / current-time line → same drill, one plugin per
 *     prop hook
 *
 * Used in:
 *   - modules/internal/verification-calls/.../verification-schedule-calendar.tsx
 */
export function CalendarView<TPayload = unknown>({
  events,
  calendars,
  views = ['day', 'week', 'month'],
  defaultView = 'week',
  timezone = 'Asia/Kolkata',
  onEventClick,
  selectedDate,
  currentView,
  hideDefaultHeader,
  nEventsPerDay,
  onClickPlusEvents,
  className,
  dayBoundaries = { start: '10:00', end: '19:00' },
}: CalendarViewProps<TPayload>) {
  // Imperative events plugin — currently only mounted (not used) so
  // future callers can opt in to optimistic add/update/remove via a
  // ref-based escape hatch we'd expose later. Cheap to keep loaded.
  const eventsService = useMemo(() => createEventsServicePlugin(), []);
  // Controls plugin exposes `setDate(...)` which we drive from the
  // optional `selectedDate` prop. Lets parent UIs (mini calendar,
  // jump-to-today, etc.) programmatically navigate the grid.
  const calendarControls = useMemo(
    () => createCalendarControlsPlugin(),
    [],
  );

  const indexedById = useMemo(() => {
    const map = new Map<string, CalendarViewEvent<TPayload>>();
    for (const event of events) map.set(event.id, event);
    return map;
  }, [events]);

  const scheduleXEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start: toZonedDateTime(event.start, timezone),
        end: toZonedDateTime(event.end, timezone),
        ...(event.calendarId ? { calendarId: event.calendarId } : {}),
        ...(event.description ? { description: event.description } : {}),
      })),
    [events, timezone],
  );

  const calendar = useCalendarApp({
    views: views.map((v) => VIEW_FACTORIES[v]()) as Parameters<
      typeof useCalendarApp
    >[0]['views'],
    defaultView,
    events: scheduleXEvents,
    plugins: [eventsService, calendarControls],
    // CRITICAL: schedule-x re-projects every event with
    // `.toZonedDateTime($app.config.timezone.value)` at render time
    // (see core.js). If this is left at its default ('UTC'), a
    // ZonedDateTime tagged IST gets converted back to UTC for the
    // grid — so a 12:00 PM IST call surfaces at 06:30 AM. Pin the
    // display timezone explicitly so the grid actually honours the
    // tz we built the events for.
    timezone,
    ...(calendars ? { calendars } : {}),
    callbacks: {
      onEventClick: (calendarEvent) => {
        const original = indexedById.get(String(calendarEvent.id));
        if (original) onEventClick?.(original);
      },
      // Schedule-X invokes this with a Temporal.PlainDate and the raw
      // mouse event. We hand the caller a plain YYYY-MM-DD string +
      // the MouseEvent — the latter has currentTarget which the
      // caller uses to anchor a popover.
      ...(onClickPlusEvents
        ? {
            // Schedule-X's type for `e` is `UIEvent | undefined`. The
            // consumer prop above narrows it to MouseEvent because
            // anchoring a popover needs `currentTarget`. Narrow here at
            // the boundary: only forward if the runtime event is in fact
            // a MouseEvent. In practice schedule-x always passes one
            // (the "+N more" button click), so the runtime check just
            // satisfies the TS contract.
            onClickPlusEvents: (
              date: { toString(): string },
              e?: UIEvent,
            ) => {
              if (e instanceof MouseEvent) {
                onClickPlusEvents(date.toString(), e);
              }
            },
          }
        : {}),
    },
    // Month overflow threshold — once exceeded, schedule-x renders a
    // ".sx__month-grid-day__events-more" button calling onClickPlusEvents.
    ...(typeof nEventsPerDay === 'number'
      ? { monthGridOptions: { nEventsPerDay } }
      : {}),
    // Visible window for the time-grid (day + week views).
    // Schedule-x validates dayBoundaries against /^\d{2}:00$/, so whole
    // hours only — `19:00` rather than `19:30` is required by the lib.
    // The 30-min interval comes from gridStep (allowed: 180|120|60|30|15).
    // Default 10:00 → 19:00 = 9 hours × 2 slots/hr = 18 slots, target
    // 44 px per slot → gridHeight = 792. Caller-provided boundaries
    // (e.g. working-hours from the scheduling settings) re-derive
    // gridHeight off the actual span so the grid stays uniformly
    // proportioned regardless of the configured window.
    dayBoundaries,
    weekOptions: {
      gridHeight:
        44 *
        2 *
        Math.max(
          1,
          Number(dayBoundaries.end.slice(0, 2)) -
            Number(dayBoundaries.start.slice(0, 2)),
        ),
      gridStep: 30,
    },
  });

  // Push event changes into schedule-x imperatively.
  // Why: @schedule-x/react's `useCalendarApp` only initialises the
  // calendar ONCE (its internal useEffect has [] deps — see
  // node_modules/@schedule-x/react/dist/index.js). Subsequent
  // changes to the `events` prop are silently ignored, so toggling
  // the sidebar filter or navigating to a date the range-fetch
  // pulled new rows for wouldn't appear until a full page reload.
  // The eventsService plugin's `set()` bulk-replaces the live
  // events; calling it whenever our derived `scheduleXEvents` array
  // changes keeps the grid in sync without remounting the calendar.
  useEffect(() => {
    try {
      eventsService.set(
        scheduleXEvents as Parameters<typeof eventsService.set>[0],
      );
    } catch {
      // Plugin not bound yet on the first render — schedule-x's
      // useCalendarApp resolves on its own first effect tick, so the
      // next change (or first state update) will succeed.
    }
  }, [scheduleXEvents, eventsService]);

  // Drive the visible date from the optional `selectedDate` prop.
  useEffect(() => {
    if (!selectedDate) return;
    const epochMs = (selectedDate instanceof Date
      ? selectedDate
      : new Date(selectedDate)
    ).getTime();
    const plainDate = Temporal.Instant.fromEpochMilliseconds(epochMs)
      .toZonedDateTimeISO(timezone)
      .toPlainDate();
    try {
      calendarControls.setDate(plainDate);
    } catch {
      // Plugin not mounted yet (first render). Subsequent effects fire.
    }
  }, [selectedDate, timezone, calendarControls]);

  // Rewrites Schedule-X's built-in overflow button label from
  // "+ N events" / "+ 1 event" to "+ N more". The library's
  // `translations` config REPLACES (not merges) the language object —
  // see core.js:5632 `config.translations || translations` — so a
  // partial override would lose every other UI string. Cheaper to
  // patch the DOM text after each render via a MutationObserver
  // scoped to our wrapper.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    const rewrite = () => {
      const buttons = root.querySelectorAll<HTMLButtonElement>(
        '.sx__month-grid-day__events-more',
      );
      for (const button of buttons) {
        const text = button.textContent ?? '';
        // Matches "+ {{n}} events" / "+ 1 event". Idempotent — if
        // it's already been rewritten to "more", the regex misses
        // and we skip the write.
        const next = text
          .replace(/(\+\s*\d+)\s+events?/i, '$1 more')
          .replace(/\+\s*1\s+event/i, '+1 more');
        if (next !== text) button.textContent = next;
      }
    };
    rewrite();
    const observer = new MutationObserver(rewrite);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // Drive the visible view from the optional `currentView` prop. Map
  // our short keys (day/week/month) to Schedule-X's internal view ids.
  useEffect(() => {
    if (!currentView) return;
    const id =
      currentView === 'day'
        ? 'day'
        : currentView === 'month'
          ? 'month-grid'
          : 'week';
    try {
      calendarControls.setView(id);
    } catch {
      // First render — calendar app not yet bound.
    }
  }, [currentView, calendarControls]);

  // Synthetic weekday header — shown only in month view. Schedule-X
  // renders day-name labels inside each first-week cell's header,
  // which forces them into a hybrid "first row of dates" row. We
  // hide those (via CSS above) and render this strip above the grid
  // so the labels read as a proper header band: weekday names →
  // border → date grid.
  const resolvedView = currentView ?? defaultView;
  const showWeekdayHeader = resolvedView === 'month';

  return (
    // Outer flex column so the weekday header (when shown) takes its
    // natural height and the Schedule-X wrapper below it flexes to
    // fill the rest. `min-h-0 flex-1` lets this whole block live
    // inside a constrained-height parent without forcing scroll.
    <div className="flex min-h-0 flex-1 flex-col">
      {showWeekdayHeader ? <WeekdayHeader /> : null}
      {/* `sx-react-calendar-wrapper` is Schedule-X's own selector hook —
          some of its internal styles cascade through this class. We add
          a wrapper class so a sibling <style> block can target it for
          height / hidden-header overrides without leaking globally. */}
      <div
        ref={wrapperRef}
        className={`rds-calendar-wrapper sx-react-calendar-wrapper min-h-0 flex-1 ${
          hideDefaultHeader ? 'rds-calendar-wrapper--no-header' : ''
        } ${
          showWeekdayHeader ? 'rds-calendar-wrapper--has-weekday-header' : ''
        } ${className ?? ''}`.trim()}
        // CSS var consumed by the ::after pseudo on the time axis below
        // — renders the working-hours end label (e.g. "7 PM") at the
        // bottom of the grid since schedule-x only labels row STARTS.
        style={{
          ['--rds-cal-end-label' as 'color']: `"${formatHourLabel(
            Number(dayBoundaries.end.slice(0, 2)),
          )}"`,
        }}
      >
      {/* Local style overrides — Schedule-X's defaults assume a fixed
          ~600 px grid and a fixed top header. In a full-height column
          we need both to stretch (or vanish, for the header). Scoped
          via the wrapper class so other future calendars aren't
          affected. */}
      <style jsx global>{`
        /* Schedule-X's own theme already chains:
             .sx__calendar-wrapper { height: 100% }
             .sx__calendar          { flex: 1; height: 100% }
             .sx__month-grid-wrapper{ display: flex; flex-flow: column; height: 100% }
             .sx__month-grid-week   { flex: 1; display: flex }
             .sx__month-grid-day    { flex: 1 }
           …so the grid fills any parent that has a real height.
           THE TRAP: ScheduleXCalendar renders an intermediate
           div.sx-react-calendar-wrapper that ships
           with NO css and collapses to its child's natural size,
           breaking the chain. So we must give BOTH our wrapper AND
           that inner div an explicit height. The selector below
           hits both because we tag our outer wrapper with the same
           class. display:flex + flex-col makes the inner mount
           div correctly grow to fill our box. */
        .sx-react-calendar-wrapper {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
        }
        /* Schedule-X's default puts a 1 px border around .sx__calendar.
           Our calendar column already has its own outer chrome, so the
           library border duplicates and looks heavy. Strip it. */
        .rds-calendar-wrapper .sx__calendar {
          border: 0 !important;
        }
        /* Re-skin the library's "today" highlight to the RDS
           text-primary blue. Schedule-X uses --sx-color-primary /
           --sx-color-on-primary for the today pill on the day-number
           AND the month-grid today cell, so overriding the two vars
           covers both views. We bind directly to --color-primary
           (defined in app/globals.css = #174ab5) so the highlight
           tracks the design token automatically. */
        .rds-calendar-wrapper {
          --sx-color-primary: var(--color-primary);
          --sx-color-on-primary: #ffffff;
          /* Sit BELOW the app's DialogBox backdrop (z-50) so an open
             modal covers the sticky weekday/header row. Theme default
             sets --sx-z-index-week-header: 100 + event-modal: 101 +
             calendar-header-popup: 102, all of which would otherwise
             render above the dialog's z-50 backdrop, leaving the MON
             8 / TUE 9 / WED 10 strip un-dimmed when the appointment
             detail dialog (or any other modal) opens over the calendar.
             We deliberately keep these single-digit so any popover that
             needs to escape this stacking context can use any normal
             z-index value and still beat the calendar header. */
          --sx-z-index-week-header: 1;
          --sx-z-index-event-modal: 1;
          --sx-calendar-header-popup-z-index: 2;
        }
        /* Left-align the day-name + date-number stack in week/day
           views. Theme default is align-items: center, which centers
           the column in its cell — in day view (one wide cell) that
           pushes the "Mon 8" all the way to the middle. The user
           wants it at the start. Keeps the same layout for week view
           because the columns are narrow there, so the visual change
           is most apparent in day view. */
        .rds-calendar-wrapper .sx__week-grid__date {
          align-items: flex-start !important;
          padding-inline-start: 8px;
        }
        /* Schedule-X hides the first hour row's label by default
           (".sx__week-grid__hour:first-child { visibility: hidden }" in
           theme-default/calendar.css). Their reason is that the hour
           label sits at top: -0.75em, so on the first row it would
           render above the grid and get clipped. We want it visible
           so the working-hours start (e.g. 10:00 AM) reads on the
           axis — push the first label DOWN into its row instead of
           letting it sit above. */
        .rds-calendar-wrapper .sx__week-grid__hour:first-child {
          visibility: visible !important;
        }
        .rds-calendar-wrapper
          .sx__week-grid__hour:first-child
          .sx__week-grid__hour-text {
          top: 0.25em;
        }
        /* Each hour-row has a border-top that sits at the very top
           of the row. The label, at top:-0.75em, floats over that
           border line and the line visually slices through the
           text. Mask the line behind the label with an opaque
           background + horizontal padding so the line appears to
           stop on either side of the time text. */
        .rds-calendar-wrapper .sx__week-grid__hour-text {
          background: var(--sx-color-background, #ffffff);
          padding: 0 8px;
          /* Move the label slightly farther LEFT of the grid so it
             doesn't sit on top of the day-column border lines (which
             extend leftward into the axis area for the first row). */
          left: -55px;
          /* A solid white box small enough to clear the row border
             above it — keeps "10:00 AM" looking like a column header
             rather than a label embedded mid-line. */
          line-height: 1.2;
        }
        /* End-of-day label (e.g. "7 PM"). Schedule-X only labels the
           START of each hour row — the working-hours END never gets
           one because the grid stops there. Render it as an ::after
           on the LAST hour row, pinned to that row's bottom so it
           reads on the time axis. Don't touch .sx__week-grid__time-axis's
           position (theme keeps it position:absolute and the grid
           lines depend on that — overriding it strips the dividers).
           Content comes from --rds-cal-end-label set on the wrapper. */
        .rds-calendar-wrapper .sx__week-grid__hour:last-child::after {
          content: var(--rds-cal-end-label, '');
          position: absolute;
          left: -43px;
          bottom: -0.75em;
          font-size: var(--sx-font-extra-small);
          color: var(--sx-color-neutral);
        }
        /* Right-align the built-in "+N more" overflow link as an RDS
           text-link. Tricky alignment context: the button is a SIBLING
           of .sx__month-grid-day__events (the grid) — both live inside
           .sx__month-grid-day, which defaults to display:block. So
           neither justify-self (grid) nor align-self/margin-auto
           (flex) align the button until we make the parent a flex
           column. Schedule-X also forces width: calc(100% - 10px) on
           the button itself, stretching it; reset to width:auto so
           align-self has visible effect. */
        .rds-calendar-wrapper .sx__month-grid-day {
          display: flex !important;
          flex-direction: column !important;
        }
        .rds-calendar-wrapper .sx__month-grid-day__events-more {
          align-self: flex-end !important;
          width: auto !important;
          background: transparent !important;
          color: var(--color-primary) !important;
          font-weight: 500 !important;
          font-size: 12px !important;
          padding: 2px 6px !important;
          margin: 0 4px !important;
          min-height: 0 !important;
          box-shadow: none !important;
          border-radius: 4px !important;
        }
        .rds-calendar-wrapper .sx__month-grid-day__events-more:hover,
        .rds-calendar-wrapper .sx__month-grid-day__events-more:focus {
          background: var(--color-primary-200) !important;
        }
        /* Month-grid borders.
           Schedule-X uses --sx-color-outline-variant for every
           internal hairline border (cell right-border, week
           top-border). We override the var AND also pin the colour
           directly on the cell/week border rules so any cascade
           hiccup or future schedule-x tweak still resolves to the
           RDS border-default token. */
        .rds-calendar-wrapper {
          --sx-color-outline-variant: var(--color-border-default);
        }
        .rds-calendar-wrapper .sx__month-grid-week,
        .rds-calendar-wrapper .sx__month-grid-day {
          border-color: var(--color-border-default) !important;
        }
        /* Day-names are rendered by Schedule-X inside each first-week
           cell's header (sibling of the date number). We render a
           SEPARATE synthetic weekday strip above the grid instead —
           hide the embedded ones so we don't double up. */
        .rds-calendar-wrapper .sx__month-grid-day__header-day-name {
          display: none !important;
        }
        /* Outer column borders.
           Schedule-X's default only puts border-inline-end on cells
           via :not(:last-child) — so internal column dividers exist
           but the OUTER edges (left of Monday, right of Sunday) are
           bare. Pin explicit borders there so the month grid reads
           as a fully framed table. */
        .rds-calendar-wrapper .sx__month-grid-day:first-child {
          border-inline-start: 1px solid var(--color-border-default) !important;
        }
        .rds-calendar-wrapper .sx__month-grid-day:last-child {
          border-inline-end: 1px solid var(--color-border-default) !important;
        }
        /* Bottom edge of the grid.
           Schedule-X draws inter-row separators via border-top on
           every .sx__month-grid-week except the first — so the last
           week is missing a line UNDER it. Pin a bottom border on
           the last week so the grid is fully framed top-to-bottom. */
        .rds-calendar-wrapper .sx__month-grid-week:last-child {
          border-bottom: 1px solid var(--color-border-default) !important;
        }
        /* 12 px gap between the synthetic weekday header (above) and
           the month grid. Applied as padding-top inside the schedule-x
           wrapper so the first week's top border lands below the gap,
           not flush against the header divider. */
        .rds-calendar-wrapper--has-weekday-header .sx__month-grid-wrapper {
          padding-top: 12px;
        }
        /* Date number: schedule-x centers the date pill in the cell
           via align-items:center on .sx__month-grid-day__header. We
           want it top-LEFT with 8 px breathing room from the edge. */
        .rds-calendar-wrapper .sx__month-grid-day__header {
          align-items: flex-start !important;
          padding-inline-start: 8px;
        }
        /* In-month dates use RDS text-body; leading/trailing (the
           greyed-out days from prev/next month that fill the grid
           corners) use text-disabled. Schedule-X tags those cells
           with .is-leading-or-trailing on .sx__month-grid-day. */
        .rds-calendar-wrapper .sx__month-grid-day__header-date {
          color: var(--color-text-body);
        }
        .rds-calendar-wrapper
          .sx__month-grid-day.is-leading-or-trailing
          .sx__month-grid-day__header-date {
          color: var(--color-text-disabled);
        }
        /* Today pill: schedule-x writes color via --sx-color-on-primary
           which we already point at #fff, but our text-body rule above
           has equal specificity (2 classes) AND comes later in the
           cascade, so it wins on tie-break and the today number
           inherits #374150 instead of white. Re-pin white with
           higher specificity (added .rds-calendar-wrapper makes it
           3 classes) so today reads correctly on the primary pill. */
        .rds-calendar-wrapper
          .sx__month-grid-day__header-date.sx__is-today {
          color: #ffffff;
        }
        /* Month-grid event chips: thinner 2 px left bar (vs. the 4 px
           Schedule-X applies to all chips by default). Week/day chips
           stay 4 px — the wider time-grid chip can afford it visually,
           but the dense single-line month chip looks cramped at 4 px.
           Schedule-X writes the border as inline style, so we need
           !important to win the cascade. */
        .rds-calendar-wrapper .sx__month-grid-event {
          border-inline-start-width: 2px !important;
        }
        .rds-calendar-wrapper--no-header .sx__calendar-header {
          display: none !important;
        }
      `}</style>
        <ScheduleXCalendar calendarApp={calendar} />
      </div>
    </div>
  );
}

// Synthetic weekday strip for month view. Renders as a 7-equal-column
// grid so it aligns 1:1 with Schedule-X's underlying month grid
// (which also splits each week into 7 equal flex children).
function WeekdayHeader() {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return (
    <div className="grid shrink-0 grid-cols-7 border-b border-border-default">
      {days.map((day) => (
        <div
          key={day}
          className="px-2 py-2 text-center text-body-xs font-medium uppercase tracking-wider text-text-subheading"
        >
          {day}
        </div>
      ))}
    </div>
  );
}
