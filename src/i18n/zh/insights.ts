import type source from "../en/insights";

const insights: Partial<Record<keyof typeof source, string>> = {
  "insights.title": "你的专注模式",
  "insights.learning": "还在学习中。再多几晚。",
  "insights.progress": "{n} / {total} 站",
  "insights.bestHard": "最适合难事",
  "insights.fades": "专注力衰退",
  "insights.after": "{at} 后",
  "insights.underestimated": "通常需要更长",
  "insights.longer": "+{pct}%",
  "insights.off": "学习已关闭。",
  "insights.turnOn": "设置",
};

export default insights;
