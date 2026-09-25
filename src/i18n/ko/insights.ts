import type source from "../en/insights";

const insights: Partial<Record<keyof typeof source, string>> = {
  "insights.title": "집중 패턴",
  "insights.learning": "아직 배우는 중이에요. 며칠 더.",
  "insights.progress": "{n}/{total} 정거장",
  "insights.bestHard": "어려운 일에 최고",
  "insights.fades": "집중이 흐려져요",
  "insights.after": "{at} 이후",
  "insights.underestimated": "보통 더 길어요",
  "insights.longer": "+{pct}%",
  "insights.off": "학습이 꺼져 있어요.",
  "insights.turnOn": "설정",
};

export default insights;
