import type source from "../en/conflict";

const conflict: Partial<Record<keyof typeof source, string>> = {
  "conflict.routeConflict": "路线冲突",
  "conflict.notEnoughTime": "{date} 前没有足够运行时间。",
  "conflict.resolve": "解决",
  "conflict.addStudyTime": "添加学习时间",
  "conflict.taskSingular": "个任务",
  "conflict.taskPlural": "个任务",
  "conflict.involved": "涉及",
  "conflict.resolveTitle": "解决路线冲突",
  "conflict.clearTitle": "路线清空",
  "conflict.eyebrow": "运行时间对截止",
  "conflict.required": "需求",
  "conflict.available": "可用",
  "conflict.shortfall": "不足",
  "conflict.deadlinePlus": "截止 +2 天",
  "conflict.reduceBy30m": "缩短 30 分",
  "conflict.delayToSomeday": "延至以后",
  "conflict.done": "完成",
  "conflict.everythingFits": "一切在截止前都能安排。",
  "conflict.resolutionNote": "优先级低的任务会先列出。给它更多时间、减少工作量或延期到另一天。",
};

export default conflict;
