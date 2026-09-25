import type source from "../en/service";

const service: Partial<Record<keyof typeof source, string>> = {
  "service.backToTonight": "今晚",
  "service.whenYouCanStudy": "何时可学习",
  "service.title": "运行时间",
  "service.weekSummary": "站点仅在这些时间运行。",
  "service.nextSevenDays": "接下来 7 天 · {min}",
  "service.everyWeek": "每周",
  "service.addWindow": "添加时间段",
  "service.noService": "无运行",
  "service.windowLabel": "{day} {start} 至 {end}{paused}",
  "service.addWindowOnDay": "在 {day} 添加时间段",
  "service.oneOffChanges": "一次性更改",
  "service.oneOffDescription": "额外时间或休息。",
  "service.extra": "额外",
  "service.extraTime": "添加额外时间",
  "service.blockTime": "阻止时间",
  "service.chooseAtLeastOneDay": "选至少一天。",
  "service.editService": "编辑运行时间",
  "service.addService": "添加运行时间",
  "service.day": "天",
  "service.days": "天",
  "service.daysLabel": "天数",
  "service.lateNightsNote": "午夜后算同一晚，直到 04:00。",
  "service.running": "运行中",
  "service.pauseDescription": "暂停此时间段但不删除。",
  "service.paused": "，已暂停",
};

export default service;
