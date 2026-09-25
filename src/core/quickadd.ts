/**
 * Natural-language Quick Add.
 *
 * A small, rule-based reader for Korean, English, Japanese and Chinese. It
 * only fills a field when the wording is clear; anything ambiguous is left
 * empty or marked `unsure` so the preview can ask. The manual form is always
 * available, so a miss here costs nothing.
 */
import { addDays, dayOfWeek, diffDays, serviceDate, toDateKey } from "./time";
import type { DateKey, Level, Line, Recurrence } from "./types";

export type QuickField =
  | "title"
  | "deadline"
  | "estimate"
  | "interest"
  | "difficulty"
  | "importance"
  | "recurrence"
  | "split"
  | "line";

export interface ParsedTask {
  title: string;
  deadline: DateKey | null;
  estimatedMinutes: number | null;
  interest: Level | null;
  difficulty: Level | null;
  importance: Level | null;
  recurrence: Recurrence | null;
  splittable: boolean | null;
  minSessionMinutes: number | null;
  maxSessionMinutes: number | null;
  lineId: string | null;
  /** Fields that were read from the text. */
  found: QuickField[];
  /** Fields that were read but deserve a second look. */
  unsure: QuickField[];
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  // Korean (native + sino)
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9, 십: 10, 이십: 20, 삼십: 30, 사십: 40, 오십: 50,
  // English
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, ninety: 90,
  // Japanese / Chinese
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 二十: 20, 三十: 30, 四十: 40,
};

const NUM = String.raw`(\d+(?:\.\d+)?|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열|이십|삼십|사십|오십|일|이|삼|사|오|육|칠|팔|구|십|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|ninety|二十|三十|四十|一|二|两|三|四|五|六|七|八|九|十)`;

function toNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isNaN(n)) return n;
  return WORD_NUMBERS[raw.toLowerCase()] ?? NaN;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Cursor {
  text: string;
}

/** Find the first match, blank it out of the text, and return it. */
function take(c: Cursor, re: RegExp): RegExpExecArray | null {
  const m = re.exec(c.text);
  if (!m) return null;
  c.text = c.text.slice(0, m.index) + " " + c.text.slice(m.index + m[0].length);
  return m;
}

const WEEKDAYS: [RegExp, number][] = [
  [/^(일|日|sun(day)?|天|日曜)/i, 0],
  [/^(월|月|mon(day)?|一)/i, 1],
  [/^(화|火|tue(s(day)?)?|二)/i, 2],
  [/^(수|水|wed(nesday)?|三)/i, 3],
  [/^(목|木|thu(rs(day)?)?|四)/i, 4],
  [/^(금|金|fri(day)?|五)/i, 5],
  [/^(토|土|sat(urday)?|六)/i, 6],
];

function weekdayOf(token: string): number | null {
  for (const [re, d] of WEEKDAYS) if (re.test(token)) return d;
  return null;
}

/** Monday-based week start. */
function mondayOf(date: DateKey): DateKey {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

function onOrAfter(today: DateKey, weekday: number): DateKey {
  return addDays(today, (weekday - dayOfWeek(today) + 7) % 7);
}

function inWeek(today: DateKey, weeksAhead: number, weekday: number): DateKey {
  const monday = addDays(mondayOf(today), weeksAhead * 7);
  return addDays(monday, (weekday + 6) % 7);
}

function sundayOf(today: DateKey, weeksAhead: number): DateKey {
  return addDays(mondayOf(today), weeksAhead * 7 + 6);
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

const BY = String.raw`(?:\s*(?:전까지|까지|안에|までに|まで|之前|以前|前))?`;

function extractDeadline(c: Cursor, today: DateKey): { value: DateKey; unsure: boolean } | null {
  let m: RegExpExecArray | null;
  const ko = String.raw`(월|화|수|목|금|토|일)요일`;
  // Korean / Japanese / Chinese: this/next week + weekday
  if ((m = take(c, new RegExp(String.raw`(이번\s*주|다음\s*주|다다음\s*주|再来週|今週|来週|下下周|这周|本周|这星期|下周|下星期)\s*の?\s*` + String.raw`(${ko}|(月|火|水|木|金|土|日)曜日?|(?:周|星期)(一|二|三|四|五|六|日|天)|(?<=周|星期)(一|二|三|四|五|六|日|天))` + BY)))) {
    const which = m[1].replace(/\s/g, "");
    const ahead = /다다음|再来週|下下/.test(which) ? 2 : /다음|来週|下/.test(which) ? 1 : 0;
    const wd = weekdayOf(m[3] ?? m[4] ?? m[5] ?? m[6] ?? "");
    if (wd !== null) {
      const date = inWeek(today, ahead, wd);
      return { value: date < today ? today : date, unsure: false };
    }
  }
  if ((m = take(c, /\b(this|next)\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i))) {
    const wd = weekdayOf(m[2])!;
    return { value: m[1].toLowerCase() === "next" ? inWeek(today, 1, wd) : onOrAfter(today, wd), unsure: false };
  }
  // Weekends
  if ((m = take(c, new RegExp(String.raw`(다음\s*주말|来週末|下周末|next\s+weekend)` + BY, "i")))) return { value: sundayOf(today, 1), unsure: false };
  if ((m = take(c, new RegExp(String.raw`(이번\s*주말|주말|今週末|週末|这周末|本周末|周末|(?:this\s+)?weekend)` + BY, "i")))) {
    const sunday = sundayOf(today, 0);
    return { value: sunday < today ? today : sunday, unsure: false };
  }
  // Plain weekday: the next one on or after today.
  if ((m = take(c, new RegExp(String.raw`(${ko}|(月|火|水|木|金|土|日)曜日?|(?:周|星期)(一|二|三|四|五|六|日|天))` + BY)))) {
    const wd = weekdayOf(m[2] ?? m[3] ?? m[4] ?? "");
    // Named today: today or a week from now? Keep today, but ask.
    if (wd !== null) return { value: onOrAfter(today, wd), unsure: wd === dayOfWeek(today) };
  }
  if ((m = take(c, /\b(?:by|before|due|on|until)?\s*(mon|tue|wed|thu|fri|sat|sun)(?:day|s|nesday|rsday|urday)?\b/i))) {
    const wd = weekdayOf(m[1]);
    if (wd !== null) return { value: onOrAfter(today, wd), unsure: wd === dayOfWeek(today) };
  }
  // Day words
  if ((m = take(c, new RegExp(String.raw`(오늘\s*밤|오늘|今夜|今晚|今日|今天|today|tonight)` + BY, "i")))) return { value: today, unsure: false };
  if ((m = take(c, new RegExp(String.raw`(글피)` + BY)))) return { value: addDays(today, 3), unsure: false };
  if ((m = take(c, new RegExp(String.raw`(모레|明後日|あさって|后天|the\s+day\s+after\s+tomorrow)` + BY, "i")))) return { value: addDays(today, 2), unsure: false };
  if ((m = take(c, new RegExp(String.raw`(내일|明日|あした|明天|tomorrow)` + BY, "i")))) return { value: addDays(today, 1), unsure: false };
  // In N days / within N days
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*(?:일|日|天)\s*(?:후|뒤|안에|이내|後|以内|后|内)`)))) {
    const n = toNumber(m[1]);
    if (n > 0 && n < 120) return { value: addDays(today, n), unsure: false };
  }
  if ((m = take(c, new RegExp(String.raw`\b(?:in|within)\s+${NUM}\s+days?\b`, "i")))) {
    const n = toNumber(m[1]);
    if (n > 0 && n < 120) return { value: addDays(today, n), unsure: false };
  }
  if ((m = take(c, new RegExp(String.raw`(일주일|한\s*주|1\s*주일?)\s*(?:후|뒤|안에|이내)|\b(?:in|within)\s+a\s+week\b`, "i")))) return { value: addDays(today, 7), unsure: false };
  // Explicit dates: M월 D일, M/D, M月D日, Month D
  if ((m = take(c, /(\d{1,2})\s*(?:월|月)\s*(\d{1,2})\s*(?:일|日|号)?(?:\s*(?:까지|まで|之前))?/))) return dateFromMonthDay(today, +m[1], +m[2]);
  if ((m = take(c, /\b(\d{1,2})\/(\d{1,2})\b/))) return dateFromMonthDay(today, +m[1], +m[2]);
  const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
  if ((m = take(c, new RegExp(String.raw`\b(?:by|before|due|on)?\s*(${MONTHS})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "i")))) {
    return dateFromMonthDay(today, MONTHS.split("|").indexOf(m[1].toLowerCase().slice(0, 3)) + 1, +m[2]);
  }
  // Vague weeks: fill in, but ask.
  if ((m = take(c, new RegExp(String.raw`(다음\s*주|来週|下周|next\s+week)` + BY, "i")))) return { value: inWeek(today, 1, 5), unsure: true };
  if ((m = take(c, new RegExp(String.raw`(이번\s*주|今週|这周|本周|this\s+week|end\s+of\s+(?:the\s+)?week)` + BY, "i")))) {
    const friday = inWeek(today, 0, 5);
    return { value: friday < today ? sundayOf(today, 0) : friday, unsure: true };
  }
  return null;
}

function dateFromMonthDay(today: DateKey, month: number, day: number): { value: DateKey; unsure: boolean } | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  let date = toDateKey(new Date(year, month - 1, day));
  if (diffDays(today, date) < -30) date = toDateKey(new Date(year + 1, month - 1, day));
  return { value: date, unsure: false };
}

/** Per-session size: "1시간씩", "30분씩", "in 1-hour chunks", "1時間ずつ", "每次1小时". */
function extractSessionSize(c: Cursor): number | null {
  let m: RegExpExecArray | null;
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*(시간|분)\s*씩(?:\s*(?:나눠서|나누어서|쪼개서|끊어서))?(?:\s*(?:하고\s*싶어|하고\s*싶음|하고\s*싶다|할래|하기|해야지))?`)))) {
    return minutesFrom(toNumber(m[1]), m[2] === "시간" ? "h" : "m");
  }
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*(時間|分)\s*ずつ`)))) return minutesFrom(toNumber(m[1]), m[2] === "時間" ? "h" : "m");
  if ((m = take(c, new RegExp(String.raw`每次\s*${NUM}\s*(个?小时|分钟)`)))) return minutesFrom(toNumber(m[1]), m[2].includes("时") ? "h" : "m");
  if ((m = take(c, new RegExp(String.raw`\b(?:in\s+)?${NUM}[-\s]*(hour|hr|minute|min)s?\s*(?:chunks?|sessions?|blocks?|at\s+a\s+time)\b`, "i")))) {
    return minutesFrom(toNumber(m[1]), /^h/i.test(m[2]) ? "h" : "m");
  }
  return null;
}

function minutesFrom(n: number, unit: "h" | "m"): number {
  return Math.round(unit === "h" ? n * 60 : n);
}

const APPROX = String.raw`(?:\s*(?:정도|쯤|가량|안팎|내외|걸릴\s*듯|걸릴\s*것\s*같아|걸림|ぐらい|くらい|程度|左右|大概))*`;

function extractDuration(c: Cursor): number | null {
  let m: RegExpExecArray | null;
  // Korean: 1시간 30분 / 한 시간 반 / 90분
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*시간\s*(?:${NUM}\s*분|(반))?` + APPROX)))) {
    const h = toNumber(m[1]);
    const extra = m[3] ? 30 : m[2] ? toNumber(m[2]) : 0;
    if (!Number.isNaN(h)) return Math.round(h * 60 + extra);
  }
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*분` + APPROX)))) return toNumber(m[1]);
  // Japanese / Chinese
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*(?:時間|个?小时|個小時)\s*(半|${NUM}\s*(?:分钟?|分))?` + APPROX)))) {
    const h = toNumber(m[1]);
    const extra = m[2] === "半" ? 30 : m[3] ? toNumber(m[3]) : 0;
    return Math.round(h * 60 + extra);
  }
  if ((m = take(c, new RegExp(String.raw`${NUM}\s*(?:分钟|分間|分)` + APPROX)))) return toNumber(m[1]);
  if ((m = take(c, /(半小时|半時間)/))) return 30;
  // English
  if ((m = take(c, /\b(?:about|around|roughly|approx\.?|maybe|like)?\s*(an?|one)\s+(?:and\s+a\s+)?half\s+hours?\b/i))) return 90;
  if ((m = take(c, /\b(?:about|around|roughly|approx\.?|maybe|like)?\s*half\s+an?\s+hour\b/i))) return 30;
  if ((m = take(c, new RegExp(String.raw`\b(?:about|around|roughly|approx\.?|maybe|like|~)?\s*${NUM}\s*(?:h|hrs?|hours?)\b(?:\s*(?:and\s*)?(\d+)\s*(?:m|mins?|minutes?)\b)?`, "i")))) {
    return Math.round(toNumber(m[1]) * 60 + (m[2] ? Number(m[2]) : 0));
  }
  if ((m = take(c, new RegExp(String.raw`\b(?:about|around|roughly|approx\.?|maybe|like|~)?\s*${NUM}\s*(?:m|mins?|minutes?)\b`, "i")))) return toNumber(m[1]);
  return null;
}

function extractRecurrence(c: Cursor): Recurrence | null {
  let m: RegExpExecArray | null;
  if (take(c, /(매일|날마다|毎日|每天|每日|\bevery\s*day\b|\bdaily\b|\beach\s+day\b)/i)) return { freq: "daily" };
  if (take(c, /(평일마다|평일에|주중에|平日|工作日|\bweekdays\b|\bevery\s+weekday\b)/i)) return { freq: "weekly", days: [1, 2, 3, 4, 5] };
  if (take(c, /(주말마다|毎週末|每个?周末|\bevery\s+weekend\b)/i)) return { freq: "weekly", days: [0, 6] };
  // 매주 월수금 / 월/수/금 / 毎週月水金 / 每周一三五 / every Mon, Wed and Fri
  if ((m = take(c, /(?:매주|毎週|每周|每星期)\s*((?:[월화수목금토일月火水木金土日一二三四五六天]\s*[,/·、・和及与]?\s*)+)(?:요일|曜日?)?(?:마다)?/))) {
    const days = [...m[1].replace(/[\s,/·、・和及与]/g, "")].map((ch) => weekdayOf(ch)).filter((d): d is number => d !== null);
    if (days.length) return { freq: "weekly", days: [...new Set(days)].sort() };
  }
  if ((m = take(c, /\bevery\s+((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*,\s*|\s+and\s+|\s*\/\s*|\s+)?)+)/i))) {
    const days = m[1].split(/[\s,/]+|and/).map((w) => (w ? weekdayOf(w) : null)).filter((d): d is number => d !== null);
    if (days.length) return { freq: "weekly", days: [...new Set(days)].sort() };
  }
  if ((m = take(c, /((?:[월화수목금토일]\s*[,/·]?\s*){2,7})요일?마다/))) {
    const days = [...m[1].replace(/[\s,/·]/g, "")].map((ch) => weekdayOf(ch)).filter((d): d is number => d !== null);
    if (days.length) return { freq: "weekly", days: [...new Set(days)].sort() };
  }
  if ((m = take(c, /([월화수목금토일])요일마다/))) return { freq: "weekly", days: [weekdayOf(m[1])!] };
  return null;
}

function extractInterest(c: Cursor): Level | null {
  if (take(c, /(정말|너무|진짜|완전)\s*(하기\s*싫|싫|귀찮)[가-힣]*/)) return 1;
  if (take(c, /(별로\s*)?(하기\s*싫[가-힣]*|싫어[가-힣]*|귀찮[가-힣]*|지루[가-힣]*|노잼|하기\s*싫음)|별로(?=[\s.,!]|$)/)) return 2;
  if (take(c, /(やりたくない|面倒[くさいだ]*|嫌だ?|だるい|不想[做写学]?|讨厌|无聊|好烦|烦)/)) return 2;
  if (take(c, /\b(really\s+)?(don'?t|do\s+not)\s+want\s+to(\s+do\s+(it|this))?\b|\b(hate|dreading|boring|ugh|not\s+excited)\b/i)) return 2;
  if (take(c, /(정말|너무|진짜|완전)\s*(재밌|재미있|좋아|기대)[가-힣]*/)) return 5;
  if (take(c, /(재밌[가-힣]*|재미있[가-힣]*|좋아하는|하고\s*싶[가-힣]*|기대[돼되]+[가-힣]*)/)) return 4;
  if (take(c, /(楽しみ|やりたい|好き|想做|喜欢|有意思|期待)/)) return 4;
  if (take(c, /\b(fun|excited|looking\s+forward|enjoy(able)?|love\s+(it|this)|want\s+to)\b/i)) return 4;
  return null;
}

function extractImportance(c: Cursor): Level | null {
  if (take(c, /(안\s*중요[가-힣]*|덜\s*중요[가-힣]*|중요하지\s*않[가-힣]*|여유\s*있[가-힣]*|重要じゃない|不重要|不太重要|\bnot\s+(that\s+)?important\b|\blow\s+priority\b|\boptional\b)/i)) return 2;
  if (take(c, /((매우|아주|정말|엄청|너무)\s*중요[가-힣]*|꼭|반드시|必ず|とても重要|非常重要|必须|一定要?|\b(very|really)\s+important\b|\bcrucial\b|\bmust\b|\burgent\b|\btop\s+priority\b)/i)) return 5;
  if (take(c, /(중요[가-힣]*|很重要|挺重要|重要|大事|\bimportant\b|\bhigh\s+priority\b)/i)) return 4;
  return null;
}

function extractDifficulty(c: Cursor): Level | null {
  if (take(c, /((매우|아주|정말|너무)\s*(어려|힘들|빡세)[가-힣]*|とても難しい|非常难|\b(very|really)\s+(hard|difficult)\b)/i)) return 5;
  if (take(c, /(어려[운워움][가-힣]*|어렵[가-힣]*|힘든|빡센|까다로[운워][가-힣]*|難しい|大変|很难|困难|比较难|\b(hard|difficult|tough|challenging)\b)/i)) return 4;
  if (take(c, /(쉬운|쉽[가-힣]*|간단[한히]*|가벼[운워][가-힣]*|簡単|楽な?|简单|容易|\b(easy|simple|quick|light)\b)/i)) return 2;
  return null;
}

function extractSplit(c: Cursor): boolean | null {
  if (take(c, /(한\s*번에|한번에|한\s*자리에서|쉬지\s*않고|一気に|一口气|\bin\s+one\s+(go|sitting)\b|\bno\s+breaks?\b)/i)) return false;
  if (take(c, /(나눠서|나누어서|쪼개서|분할해서|分けて|分开|分几次|\bsplit(\s+it)?\b|\bin\s+chunks\b|\bbit\s+by\s+bit\b)(\s*(하고\s*싶어|하고\s*싶음|할래|하기))?/i)) return true;
  return null;
}

function extractLine(c: Cursor, lines: Line[]): { id: string; unsure: boolean } | null {
  const tag = /#(\S+)/.exec(c.text);
  const lower = c.text.toLowerCase();
  for (const line of lines) {
    const title = line.title.toLowerCase();
    if (tag && title.includes(tag[1].toLowerCase())) {
      take(c, /#\S+/);
      return { id: line.id, unsure: false };
    }
    if (title.length >= 2 && lower.includes(title)) {
      const idx = lower.indexOf(title);
      c.text = c.text.slice(0, idx) + " " + c.text.slice(idx + title.length);
      return { id: line.id, unsure: false };
    }
  }
  // A shared distinctive word ("biology", "생명") suggests a line, but only as a suggestion.
  const words = lower.split(/[\s,.!?]+/).filter((w) => w.length >= 2);
  for (const line of lines) {
    const lineWords = line.title.toLowerCase().split(/[\s,.!?]+/).filter((w) => w.length >= 2);
    if (lineWords.some((w) => words.includes(w))) return { id: line.id, unsure: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

const FILLER = new Set([
  // Korean
  "해야", "하고", "해야하고", "해야함", "해야해", "해야돼", "해야되고", "해야하는데", "하는데", "해", "함", "돼", "되고", "정도", "쯤", "좀",
  "그리고", "그냥", "걸릴", "듯", "것", "같아", "같음", "할", "거", "예정", "끝내야", "끝내기", "마무리", "필요", "있음", "있어", "해서", "하기",
  "하는", "해야지", "할래", "끝내야함", "하는게", "해야겠다", "까지",
  // English
  "i", "need", "needs", "to", "have", "has", "should", "must", "gotta", "and", "but", "it", "it'll", "will", "take", "takes", "about",
  "around", "roughly", "approx", "maybe", "by", "before", "due", "until", "finish", "do", "the", "for", "probably", "some", "so",
  // Japanese / Chinese
  "やる", "しないと", "する", "くらい", "かかる", "かかりそう", "要", "做", "完成", "需要", "得", "大概", "左右",
]);

function cleanTitle(text: string): string {
  const tokens = text
    .replace(/[.,!?;:·、。，！？]+/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !FILLER.has(w.toLowerCase()));
  // Drop a trailing object particle ("보고서를" → "보고서").
  const last = tokens.length - 1;
  if (last >= 0 && /[가-힣]{2,}[을를]$/.test(tokens[last])) tokens[last] = tokens[last].slice(0, -1);
  return tokens.join(" ").trim();
}

// ---------------------------------------------------------------------------

export function parseQuickAdd(input: string, now: Date, lines: Line[] = []): ParsedTask {
  const today = serviceDate(now);
  const c: Cursor = { text: ` ${input.trim()} ` };
  const found: QuickField[] = [];
  const unsure: QuickField[] = [];

  const recurrence = extractRecurrence(c);
  if (recurrence) found.push("recurrence");
  const session = extractSessionSize(c);
  const split = extractSplit(c);
  const deadline = extractDeadline(c, today);
  if (deadline) {
    found.push("deadline");
    if (deadline.unsure) unsure.push("deadline");
  }
  const estimate = extractDuration(c);
  if (estimate) found.push("estimate");
  const importance = extractImportance(c);
  if (importance) found.push("importance");
  const difficulty = extractDifficulty(c);
  if (difficulty) found.push("difficulty");
  const interest = extractInterest(c);
  if (interest) found.push("interest");
  const line = extractLine(c, lines);
  if (line) {
    found.push("line");
    if (line.unsure) unsure.push("line");
  }

  let splittable: boolean | null = split;
  let min: number | null = null;
  let max: number | null = null;
  if (session) {
    splittable = true;
    max = session;
    min = Math.min(session, Math.max(15, Math.round((session * 0.75) / 5) * 5));
  }
  if (splittable !== null) found.push("split");

  let title = cleanTitle(c.text);
  if (!title) {
    title = input.trim();
    unsure.push("title");
  } else {
    found.push("title");
  }

  return {
    title,
    deadline: deadline?.value ?? null,
    estimatedMinutes: estimate && estimate > 0 ? Math.min(estimate, 60 * 60) : null,
    interest,
    difficulty,
    importance,
    recurrence,
    splittable,
    minSessionMinutes: min,
    maxSessionMinutes: max,
    lineId: line?.id ?? null,
    found,
    unsure,
  };
}
