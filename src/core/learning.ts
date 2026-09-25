/**
 * Quiet learning: simple statistics over past stations, used only once there
 * is enough data, and always weaker than deadlines, workload and importance.
 *
 * - Task similarity: subject + kind of work, read from the title (any of the
 *   supported languages) — "수학 문제집" and "Math problem set" match, "수학
 *   문제집" and "수학 개념 정리" don't.
 * - Estimate calibration: how long similar work really took versus the
 *   traveller's own estimate.
 * - Focus pattern: when hard work tends to get finished, and when focus fades.
 */
import { addDays, diffDays, minutesFrom, serviceDate } from "./time";
import type { NocturneData, StudySession, Task } from "./types";

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

const SUBJECTS: Record<string, RegExp> = {
  math: /수학|미적분|기하|확률|통계|함수|math|calculus|algebra|geometry|statistic|数学|數學|微積分|微积分/i,
  physics: /물리|physics|物理/i,
  chemistry: /화학|chem|化学|化學/i,
  biology: /생명|생물|biology|\bbio\b|生物/i,
  earth: /지구과학|earth\s*science|地学|地球科学/i,
  english: /영어|english|英語|英语/i,
  korean: /국어|문학|문법|korean|国語/i,
  history: /역사|한국사|세계사|history|歴史|历史/i,
  social: /사회|경제|정치|윤리|지리|social|economics|politics|geography|社会|経済|经济|地理/i,
  language: /일본어|중국어|스페인어|프랑스어|독일어|japanese|chinese|spanish|french|german|日本語|中国語|日语|汉语|西班牙/i,
  coding: /코딩|프로그래밍|알고리즘|coding|programming|algorithm|プログラミング|编程|代码|算法/i,
};

const ACTIVITIES: Record<string, RegExp> = {
  problems: /문제|풀이|오답|기출|모의고사|problem|exercise|worksheet|practice|drill|問題|演習|练习|习题|题/i,
  memorize: /암기|단어|외우|vocab|memori[sz]|flashcard|暗記|単語|单词|背/i,
  writing: /보고서|에세이|작문|글쓰기|독후감|논술|report|essay|paper|writing|レポート|作文|論文|报告|论文/i,
  reading: /읽기|독서|reading|\bread\b|読書|阅读/i,
  review: /복습|정리|요약|개념|review|summary|notes|concept|復習|まとめ|复习|总结|概念/i,
  presentation: /발표|슬라이드|ppt|presentation|slides|発表|演示|汇报/i,
  lab: /실험|lab\b|実験|实验/i,
};

export interface TaskKind {
  subject: string | null;
  activity: string | null;
}

export function kindOf(title: string): TaskKind {
  const subject = Object.entries(SUBJECTS).find(([, re]) => re.test(title))?.[0] ?? null;
  const activity = Object.entries(ACTIVITIES).find(([, re]) => re.test(title))?.[0] ?? null;
  return { subject, activity };
}

/** Group key for calibration; null when a title says too little to compare. */
export function similarityKey(task: Pick<Task, "title" | "lineId">): string | null {
  const { subject, activity } = kindOf(task.title);
  if (subject && activity) return `${subject}:${activity}`;
  if (subject) return `${subject}:*`;
  if (activity && task.lineId) return `line:${task.lineId}:${activity}`;
  if (activity) return `*:${activity}`;
  return null;
}

export function isSimilar(a: Pick<Task, "title" | "lineId">, b: Pick<Task, "title" | "lineId">): boolean {
  const ka = similarityKey(a);
  return ka !== null && ka === similarityKey(b);
}

// ---------------------------------------------------------------------------
// Estimate calibration
// ---------------------------------------------------------------------------

export const MIN_SIMILAR_TASKS = 3;
export const MIN_SIMILAR_SESSIONS = 6;
const MAX_SPREAD = 0.45; // coefficient of variation above which estimates are too erratic to learn from
const MIN_DIFFERENCE = 0.15;

export interface Calibration {
  ratio: number;
  suggestedMinutes: number;
  basis: "tasks" | "sessions";
  samples: number;
  /** A recent similar task, to name the group in plain words. */
  example: string;
}

const closed = (s: StudySession) => s.status === "done" || s.status === "partial";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function spread(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return mean > 0 ? sd / mean : Infinity;
}

/**
 * How long work like this really takes compared with the estimate. Returns
 * null when there isn't enough consistent history, or when estimates are
 * already close.
 */
export function calibrate(
  data: NocturneData,
  draft: Pick<Task, "title" | "lineId"> & { id?: string },
  estimateMinutes: number,
): Calibration | null {
  if (!data.profile.learnFromSessions || !data.profile.autoAdjustEstimates) return null;
  if (estimateMinutes <= 0) return null;
  const key = similarityKey(draft);
  if (!key) return null;
  const similar = data.tasks.filter((t) => t.id !== draft.id && !t.recurrence && similarityKey(t) === key);
  if (similar.length === 0) return null;
  const byTask = new Map<string, StudySession[]>();
  for (const s of data.sessions) {
    if (!closed(s)) continue;
    const list = byTask.get(s.taskId) ?? [];
    list.push(s);
    byTask.set(s.taskId, list);
  }

  // Whole tasks: total focused time versus the traveller's own estimate.
  const taskRatios: number[] = [];
  const sources = new Set<string>();
  for (const t of similar) {
    if (t.status !== "done") continue;
    const own = t.userEstimatedMinutes ?? t.estimatedMinutes;
    const actual = (byTask.get(t.id) ?? []).reduce((a, s) => a + s.completedMinutes, 0);
    if (own >= 10 && actual >= 10) {
      taskRatios.push(actual / own);
      sources.add(t.id);
    }
  }
  // Single stations that ran their course (finished, early or extended).
  const sessionRatios: number[] = [];
  const sessionSources = new Set<string>();
  for (const t of similar) {
    for (const s of byTask.get(t.id) ?? []) {
      if (s.status !== "done" || s.workMinutes < 10) continue;
      if (s.endedBy && !["complete", "early", "early-all"].includes(s.endedBy)) continue;
      sessionRatios.push(s.completedMinutes / s.workMinutes);
      sessionSources.add(t.id);
    }
  }

  let ratios: number[];
  let basis: Calibration["basis"];
  if (taskRatios.length >= MIN_SIMILAR_TASKS) {
    ratios = taskRatios;
    basis = "tasks";
  } else if (sessionRatios.length >= MIN_SIMILAR_SESSIONS) {
    ratios = sessionRatios;
    basis = "sessions";
  } else return null;
  if (spread(ratios) > MAX_SPREAD) return null;
  const ratio = Math.min(1.8, Math.max(0.6, median(ratios)));
  if (Math.abs(ratio - 1) < MIN_DIFFERENCE) return null;
  // Name a task the numbers actually came from, never the one being planned.
  const used = basis === "tasks" ? sources : sessionSources;
  const example = similar.filter((t) => used.has(t.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].title;
  return {
    ratio,
    suggestedMinutes: Math.max(5, Math.round((estimateMinutes * ratio) / 5) * 5),
    basis,
    samples: ratios.length,
    example,
  };
}

// ---------------------------------------------------------------------------
// Focus pattern
// ---------------------------------------------------------------------------

export const MIN_PATTERN_SESSIONS = 10;
export const MIN_PATTERN_DAYS = 5;
const MIN_BUCKET = 4;
const WINDOW_DAYS = 28;
const FOCUS_VALUE = { low: 0, steady: 1, sharp: 2 } as const;

export interface HourStat {
  /** Service-day hour (can be ≥ 24 after midnight). */
  hour: number;
  sessions: number;
  completion: number;
  hardSessions: number;
  hardCompletion: number;
  focus: number | null;
}

export interface FocusProfile {
  ready: boolean;
  sessions: number;
  days: number;
  hours: HourStat[];
  overallCompletion: number;
  overallHardCompletion: number;
  /** Best stretch for demanding work, in service-day hours [from, to). */
  bestHardWindow: [number, number] | null;
  /** From this hour on, stations tend to be cut short. */
  fadesAfter: number | null;
  rates: { finishEarly: number; moreTime: number; lowFocus: number };
  completionByDifficulty: Record<number, number>;
  /** Share of stations skipped or left behind, by interest level. */
  postponedByInterest: Record<number, number>;
  /** Average focused minutes on each weekday (0 = Sunday). */
  weekday: number[];
  /** Similar-task groups that usually take longer than planned. */
  underestimated: { example: string; ratio: number }[];
}

function finished(s: StudySession): boolean {
  return s.status === "done" && (!s.endedBy || ["complete", "early", "early-all"].includes(s.endedBy));
}

export function focusProfile(data: NocturneData, now: Date): FocusProfile {
  const today = serviceDate(now);
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const recent = data.sessions.filter((s) => {
    const age = diffDays(s.date, today);
    return age >= 0 && age < WINDOW_DAYS && (closed(s) || s.status === "skipped") && !(s.date === today && s.status === "skipped" && !s.endedBy);
  });
  const worked = recent.filter((s) => closed(s) && s.actualStart);
  const days = new Set(worked.map((s) => s.date)).size;

  const buckets = new Map<number, { n: number; ok: number; hn: number; hok: number; f: number[] }>();
  for (const s of worked) {
    const hour = Math.floor(minutesFrom(s.date, s.actualStart!) / 60);
    const b = buckets.get(hour) ?? { n: 0, ok: 0, hn: 0, hok: 0, f: [] };
    const ok = finished(s);
    b.n += 1;
    if (ok) b.ok += 1;
    if ((tasks.get(s.taskId)?.difficulty ?? 3) >= 4) {
      b.hn += 1;
      if (ok) b.hok += 1;
    }
    if (s.focusBefore) b.f.push(FOCUS_VALUE[s.focusBefore]);
    buckets.set(hour, b);
  }
  const hours: HourStat[] = [...buckets.entries()]
    .map(([hour, b]) => ({
      hour,
      sessions: b.n,
      completion: b.n ? b.ok / b.n : 0,
      hardSessions: b.hn,
      hardCompletion: b.hn ? b.hok / b.hn : 0,
      focus: b.f.length ? b.f.reduce((a, x) => a + x, 0) / b.f.length : null,
    }))
    .sort((a, b) => a.hour - b.hour);

  const total = worked.length;
  const overallCompletion = total ? worked.filter(finished).length / total : 0;
  const hard = worked.filter((s) => (tasks.get(s.taskId)?.difficulty ?? 3) >= 4);
  const overallHardCompletion = hard.length ? hard.filter(finished).length / hard.length : 0;
  const ready = total >= MIN_PATTERN_SESSIONS && days >= MIN_PATTERN_DAYS;

  // Best window for hard work: adjacent hours that beat the overall rate.
  let bestHardWindow: [number, number] | null = null;
  if (ready) {
    const good = hours.filter((h) => h.hardSessions >= MIN_BUCKET && h.hardCompletion >= overallHardCompletion + 0.1);
    if (good.length) {
      const top = good.reduce((a, b) => (b.hardCompletion > a.hardCompletion ? b : a));
      let from = top.hour;
      let to = top.hour + 1;
      while (good.some((h) => h.hour === from - 1)) from -= 1;
      while (good.some((h) => h.hour === to)) to += 1;
      bestHardWindow = [from, to];
    }
  }
  // Fading: from this hour on, every measured hour trails the average.
  let fadesAfter: number | null = null;
  if (ready) {
    const measured = hours.filter((h) => h.sessions >= MIN_BUCKET);
    for (let i = measured.length - 1; i >= 0; i--) {
      if (measured[i].completion <= overallCompletion - 0.15) fadesAfter = measured[i].hour;
      else break;
    }
    if (fadesAfter !== null && fadesAfter === measured[0]?.hour) fadesAfter = null;
  }

  const count = (pred: (s: StudySession) => boolean) => (recent.length ? recent.filter(pred).length / recent.length : 0);
  const rates = {
    finishEarly: count((s) => s.endedBy === "early" || s.endedBy === "early-all"),
    moreTime: count((s) => s.extendedMinutes > 0),
    lowFocus: count((s) => s.endedBy === "low-focus"),
  };

  const completionByDifficulty: Record<number, number> = {};
  const postponedByInterest: Record<number, number> = {};
  for (let level = 1; level <= 5; level++) {
    const d = worked.filter((s) => tasks.get(s.taskId)?.difficulty === level);
    if (d.length) completionByDifficulty[level] = d.filter(finished).length / d.length;
    const i = recent.filter((s) => tasks.get(s.taskId)?.interest === level);
    if (i.length) postponedByInterest[level] = i.filter((s) => s.status === "skipped" || s.endedBy === "low-focus").length / i.length;
  }

  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const weekdayDays = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = addDays(today, -i);
    const wd = new Date(`${date}T12:00:00`).getDay();
    weekdayDays[wd] += 1;
    weekday[wd] += worked.filter((s) => s.date === date).reduce((a, s) => a + s.completedMinutes, 0);
  }

  const groups = new Map<string, Task>();
  for (const t of data.tasks) {
    const key = similarityKey(t);
    if (key && !groups.has(key)) groups.set(key, t);
  }
  const underestimated: FocusProfile["underestimated"] = [];
  if (data.profile.autoAdjustEstimates) {
    for (const t of groups.values()) {
      const c = calibrate(data, { title: t.title, lineId: t.lineId, id: "__probe__" }, 60);
      if (c && c.ratio >= 1.15) underestimated.push({ example: c.example, ratio: c.ratio });
    }
  }

  return {
    ready,
    sessions: total,
    days,
    hours,
    overallCompletion,
    overallHardCompletion,
    bestHardWindow,
    fadesAfter,
    rates,
    completionByDifficulty,
    postponedByInterest,
    weekday: weekday.map((m, i) => (weekdayDays[i] ? m / weekdayDays[i] : 0)),
    underestimated,
  };
}

/** The profile the scheduler may use, or null when the traveller opted out or data is thin. */
export function schedulingProfile(data: NocturneData, now: Date): FocusProfile | null {
  if (!data.profile.learnFromSessions || !data.profile.useFocusHistory) return null;
  const p = focusProfile(data, now);
  return p.ready ? p : null;
}

/**
 * A small nudge (−0.3…+0.3) for placing a demanding task at `startMinute`,
 * based on how hard work has gone at that hour. Zero for easy work or thin data.
 */
export function historyNudge(profile: FocusProfile | null, task: Task, startMinute: number): number {
  if (!profile || task.difficulty < 4) return 0;
  const h = profile.hours.find((x) => x.hour === Math.floor(startMinute / 60));
  if (!h || h.hardSessions < MIN_BUCKET) return 0;
  return Math.max(-0.3, Math.min(0.3, h.hardCompletion - profile.overallHardCompletion));
}
