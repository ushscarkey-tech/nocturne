/**
 * Nocturne domain model.
 *
 * Everything under `src/core` is framework-free TypeScript so it can be
 * reused by a future React Native / Expo client. Dates are stored as
 * `YYYY-MM-DD` keys in the user's local time; instants are ISO strings.
 */

export type DateKey = string;
export type ISODateTime = string;

export type FocusLevel = "low" | "steady" | "sharp";
export type Locale = "en" | "ko" | "ja" | "zh";
export type Level = 1 | 2 | 3 | 4 | 5;

/** `archived` = deleted by the traveller but kept so past journeys stay intact. */
export type TaskStatus = "inbox" | "active" | "done" | "archived";

export type Recurrence =
  | { freq: "daily" }
  | { freq: "weekly"; days: number[] }; // 0 = Sunday

export interface Profile {
  id: string;
  name: string;
  timezone: string;
  createdAt: ISODateTime;
  /** Defaults used by the focus ritual. */
  preferredCarriage: CarriageId;
  autoTunnel: boolean;
  locale: Locale;
  /** Set once the first-run setup is finished. */
  onboardedAt: ISODateTime | null;
  /** Personalization switches — each can be turned off on its own. */
  learnFromSessions: boolean;
  autoAdjustEstimates: boolean;
  useFocusHistory: boolean;
  /** Shorter Station Stops (5 min after a long station instead of 10), to fit more in. */
  shortStops: boolean;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  /** Last day the work may be done on. `null` means Someday. */
  deadline: DateKey | null;
  /** Total estimate used for planning. For recurring tasks this is the per-occurrence length. */
  estimatedMinutes: number;
  /**
   * The traveller's own estimate when they accepted a calibrated one
   * (`estimatedMinutes` then holds the adjusted value). Null = unadjusted.
   */
  userEstimatedMinutes: number | null;
  /** Minutes a rescue plan has already trimmed off, so it never trims a task twice over. */
  trimmedMinutes?: number;
  remainingMinutes: number;
  interest: Level;
  difficulty: Level;
  importance: Level;
  splittable: boolean;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  recurrence: Recurrence | null;
  status: TaskStatus;
  lineId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export type WindowKind = "available" | "blocked";

export interface StudyWindow {
  id: string;
  userId: string;
  /** Weekly windows use `dayOfWeek`; one-off exceptions use `specificDate`. */
  dayOfWeek: number | null;
  specificDate: DateKey | null;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  recurring: boolean;
  enabled: boolean;
  /** `blocked` exceptions remove time from a specific date. */
  kind: WindowKind;
}

export type SessionStatus = "planned" | "active" | "done" | "partial" | "skipped";

/** How a station closed — the raw material for learning focus patterns. */
export type SessionEnd = "complete" | "early" | "early-all" | "low-focus" | "ended" | "removed" | "skipped" | "unreached";

export interface StudySession {
  id: string;
  taskId: string;
  userId: string;
  date: DateKey;
  sequence: number;
  stationName: string;
  plannedStart: ISODateTime;
  plannedEnd: ISODateTime;
  /** Time on the clock this station occupies (grows with "Need more time"). */
  plannedMinutes: number;
  /** Amount of task work this station represents. */
  workMinutes: number;
  /** Actual focused minutes. */
  completedMinutes: number;
  /** Work credited to the task when the station closed. */
  creditedMinutes: number;
  status: SessionStatus;
  locked: boolean;
  actualStart: ISODateTime | null;
  actualEnd: ISODateTime | null;
  /** Focus timer bookkeeping: seconds banked before `resumedAt`. */
  elapsedSeconds: number;
  resumedAt: ISODateTime | null;
  focusBefore: FocusLevel | null;
  focusAfter: FocusLevel | null;
  endedBy: SessionEnd | null;
  /** Minutes added with "Need more time". */
  extendedMinutes: number;
}

export interface Line {
  id: string;
  userId: string;
  title: string;
  description: string;
  targetDate: DateKey | null;
  createdAt: ISODateTime;
}

export type CarriageId = "quiet" | "rain" | "tunnel" | "moon";
export type AmbienceId = "quiet-cabin" | "rain-window" | "tunnel" | "night-rail";

export type JourneyPhase = "boarding" | "cabin" | "stop" | "paused" | "final";

/** A translatable message: the UI renders `key` with `params` in the traveller's language. */
export interface Message {
  key: string;
  params?: Record<string, string | number>;
}

export interface RouteChange {
  at: ISODateTime;
  reason: ReplanReason;
  /** English rendering, kept for older records and tests. */
  headline: string;
  lines: string[];
  messages?: Message[];
}

export interface FocusMark {
  at: ISODateTime;
  level: FocusLevel;
}

export interface Journey {
  id: string;
  userId: string;
  date: DateKey;
  phase: JourneyPhase;
  platform: string;
  car: string;
  seat: string;
  plannedMinutes: number;
  focusedMinutes: number;
  stationsPlanned: number;
  stationsCompleted: number;
  routeChanges: number;
  selectedCarriage: CarriageId;
  selectedAmbience: AmbienceId;
  plannedDeparture: ISODateTime | null;
  plannedArrival: ISODateTime | null;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  stopEndsAt: ISODateTime | null;
  focus: FocusLevel;
  focusLog: FocusMark[];
  changeLog: RouteChange[];
}

export type TicketStyle = CarriageId;

export interface Ticket {
  id: string;
  journeyId: string;
  userId: string;
  generatedAt: ISODateTime;
  ticketStyle: TicketStyle;
  serial: string;
}

export type ReplanReason =
  | "initial"
  | "boarding"
  | "late-start"
  | "finish-early"
  | "more-time"
  | "low-focus"
  | "signal-change"
  | "skip"
  | "task-change"
  | "reorder"
  | "edit"
  | "optimize"
  | "service-resume"
  | "depart";

/** The full client-side dataset for one traveller. */
export interface NocturneData {
  profile: Profile;
  tasks: Task[];
  windows: StudyWindow[];
  sessions: StudySession[];
  lines: Line[];
  journeys: Journey[];
  tickets: Ticket[];
}

export type CollectionName = "tasks" | "windows" | "sessions" | "lines" | "journeys" | "tickets";

export const PROFILE_DEFAULTS = {
  locale: "en" as Locale,
  onboardedAt: null,
  learnFromSessions: true,
  autoAdjustEstimates: true,
  useFocusHistory: true,
  shortStops: false,
};

/** Fill fields added after a record was saved, so old data keeps working. */
export function normalizeData(data: NocturneData): NocturneData {
  return {
    ...data,
    profile: {
      ...PROFILE_DEFAULTS,
      ...data.profile,
      // Travellers from before the first-run guide existed have already set up.
      onboardedAt:
        data.profile.onboardedAt !== undefined
          ? data.profile.onboardedAt
          : data.tasks.length > 0 || data.journeys.length > 0
            ? data.profile.createdAt
            : null,
    },
    tasks: data.tasks.map((t) => ({ ...t, userEstimatedMinutes: t.userEstimatedMinutes ?? null })),
    sessions: data.sessions.map((s) => ({ ...s, endedBy: s.endedBy ?? null, extendedMinutes: s.extendedMinutes ?? 0 })),
  };
}
