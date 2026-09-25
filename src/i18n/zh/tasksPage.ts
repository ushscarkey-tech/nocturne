import type source from "../en/tasksPage";

const tasksPage: Partial<Record<keyof typeof source, string>> = {
  "tasksPage.title": "任务",
  "tasksPage.newTask": "新任务",
  "tasksPage.empty": "暂无任务。",
  "tasksPage.inbox": "收件箱",
  "tasksPage.inboxHint": "添加截止和时间安排。",
  "tasksPage.today": "今天",
  "tasksPage.upcoming": "即将",
  "tasksPage.someday": "以后",
  "tasksPage.somedayHint": "仅在闲时。",
  "tasksPage.completed": "已完成",
};

export default tasksPage;
