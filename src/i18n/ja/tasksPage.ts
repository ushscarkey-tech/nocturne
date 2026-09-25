import type source from "../en/tasksPage";

const tasksPage: Partial<Record<keyof typeof source, string>> = {
  "tasksPage.completed": "完了",
  "tasksPage.empty": "タスクはまだありません。",
  "tasksPage.inbox": "受信箱",
  "tasksPage.inboxHint": "締め切りと時間を追加して計画してください。",
  "tasksPage.newTask": "新しいタスク",
  "tasksPage.someday": "いつか",
  "tasksPage.somedayHint": "暇な時間のみ。",
  "tasksPage.title": "タスク",
  "tasksPage.today": "今日",
  "tasksPage.upcoming": "近日中",
};

export default tasksPage;