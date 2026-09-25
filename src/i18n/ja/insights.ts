import type source from "../en/insights";

const insights: Partial<Record<keyof typeof source, string>> = {
  "insights.after": "{at}後",
  "insights.bestHard": "難しい仕事に最適",
  "insights.fades": "集中が消える",
  "insights.learning": "まだ学習中。あと何夜か。",
  "insights.longer": "+{pct}%",
  "insights.off": "学習はオフです。",
  "insights.progress": "{total}中{n}",
  "insights.title": "あなたの集中パターン",
  "insights.turnOn": "設定",
  "insights.underestimated": "実際にはもっと時間がかかる",
};

export default insights;