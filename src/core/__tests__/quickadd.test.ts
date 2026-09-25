import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../quickadd";
import type { Line } from "../types";

// Friday, Sep 25 2026, evening.
const now = new Date(2026, 8, 25, 20, 0);
const line = (id: string, title: string): Line => ({ id, userId: "u", title, description: "", targetDate: null, createdAt: "" });

describe("natural-language quick add", () => {
  it("reads a Korean task with a relative weekday, duration and reluctance", () => {
    const p = parseQuickAdd("다음 주 화요일까지 생명 3시간 정도 해야 하고 별로 하기 싫어", now);
    expect(p.title).toBe("생명");
    expect(p.deadline).toBe("2026-09-29");
    expect(p.estimatedMinutes).toBe(180);
    expect(p.interest).toBe(2);
    expect(p.unsure).not.toContain("deadline");
  });

  it("reads Korean number words and importance", () => {
    const p = parseQuickAdd("금요일까지 수학 문제집 100문제, 두 시간쯤 걸릴 듯. 중요함.", now);
    expect(p.title).toBe("수학 문제집 100문제");
    expect(p.deadline).toBe("2026-09-25");
    // Typed on a Friday: today, but worth a second look.
    expect(p.unsure).toContain("deadline");
    expect(p.estimatedMinutes).toBe(120);
    expect(p.importance).toBe(4);
  });

  it("does not question a weekday that is not today", () => {
    expect(parseQuickAdd("수요일까지 에세이", now).unsure).not.toContain("deadline");
    expect(parseQuickAdd("essay by friday", now).unsure).toContain("deadline");
  });

  it("reads daily recurrence", () => {
    const p = parseQuickAdd("매일 영어 단어 30분", now);
    expect(p.title).toBe("영어 단어");
    expect(p.recurrence).toEqual({ freq: "daily" });
    expect(p.estimatedMinutes).toBe(30);
    expect(p.deadline).toBeNull();
  });

  it("reads weekend deadlines and session size without mistaking it for interest", () => {
    const p = parseQuickAdd("이번 주말까지 보고서 4시간 정도 해야 하는데 1시간씩 나눠서 하고 싶어", now);
    expect(p.title).toBe("보고서");
    expect(p.deadline).toBe("2026-09-27");
    expect(p.estimatedMinutes).toBe(240);
    expect(p.splittable).toBe(true);
    expect(p.maxSessionMinutes).toBe(60);
    expect(p.interest).toBeNull();
  });

  it("leaves unknown fields empty instead of guessing", () => {
    const p = parseQuickAdd("화학 실험 보고서", now);
    expect(p.title).toBe("화학 실험 보고서");
    expect(p.deadline).toBeNull();
    expect(p.estimatedMinutes).toBeNull();
    expect(p.interest).toBeNull();
    expect(p.importance).toBeNull();
  });

  it("handles 내일, 모레 and vague weeks (flagged as unsure)", () => {
    expect(parseQuickAdd("내일까지 독후감", now).deadline).toBe("2026-09-26");
    expect(parseQuickAdd("모레 발표 준비 1시간 반", now).estimatedMinutes).toBe(90);
    const vague = parseQuickAdd("다음 주까지 물리 과제", now);
    expect(vague.deadline).toBe("2026-10-02");
    expect(vague.unsure).toContain("deadline");
    expect(vague.title).toBe("물리 과제");
  });

  it("reads English", () => {
    const p = parseQuickAdd("Physics workbook by next Tuesday, about 2.5 hours, really don't want to. Important", now);
    expect(p.title).toBe("Physics workbook");
    expect(p.deadline).toBe("2026-09-29");
    expect(p.estimatedMinutes).toBe(150);
    expect(p.interest).toBe(2);
    expect(p.importance).toBe(4);
    const q = parseQuickAdd("history essay tomorrow in 30 min chunks, 2h", now);
    expect(q.deadline).toBe("2026-09-26");
    expect(q.maxSessionMinutes).toBe(30);
    expect(q.estimatedMinutes).toBe(120);
    expect(q.title).toBe("history essay");
    expect(parseQuickAdd("vocab every Mon, Wed and Fri 20 min", now).recurrence).toEqual({ freq: "weekly", days: [1, 3, 5] });
  });

  it("reads Japanese and Chinese", () => {
    const ja = parseQuickAdd("来週の月曜まで 数学の問題集 2時間半", now);
    expect(ja.estimatedMinutes).toBe(150);
    const zh = parseQuickAdd("下周三之前 物理作业 两个小时 很难", now);
    expect(zh.deadline).toBe("2026-09-30");
    expect(zh.estimatedMinutes).toBe(120);
    expect(zh.difficulty).toBe(4);
    expect(parseQuickAdd("每周一三五 英语单词 30分钟", now).recurrence).toEqual({ freq: "weekly", days: [1, 3, 5] });
  });

  it("suggests a line from a shared word, but marks it unsure", () => {
    const lines = [line("bio", "생명 중간고사"), line("res", "Research Presentation")];
    const p = parseQuickAdd("생명 암기 1시간", now, lines);
    expect(p.lineId).toBe("bio");
    expect(p.unsure).toContain("line");
    const tagged = parseQuickAdd("slides #research 3h", now, lines);
    expect(tagged.lineId).toBe("res");
    expect(tagged.unsure).not.toContain("line");
  });

  it("never returns an empty title", () => {
    const p = parseQuickAdd("내일 2시간", now);
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.unsure).toContain("title");
  });
  it("reads Japanese and Chinese week phrases without leaving particles in the title", () => {
    const ja = parseQuickAdd("来週の金曜までに数学の問題集 2時間", now);
    expect(ja.title).toBe("数学の問題集");
    expect(ja.deadline).toBe("2026-10-02");
    const zh = parseQuickAdd("下周三之前 物理作业 3小时 很重要", now);
    expect(zh.title).toBe("物理作业");
    expect(zh.deadline).toBe("2026-09-30");
    expect(zh.importance).toBe(4);
    expect(parseQuickAdd("오늘 밤 영어 단어 20분", now).title).toBe("영어 단어");
  });
});
