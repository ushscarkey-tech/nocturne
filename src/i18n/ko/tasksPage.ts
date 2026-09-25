import type source from "../en/tasksPage";

const tasksPage: Partial<Record<keyof typeof source, string>> = {
  "tasksPage.title": "할 일",
  "tasksPage.newTask": "새 할 일",
  "tasksPage.empty": "아직 할 일이 없어요.",
  "tasksPage.inbox": "받은 할 일",
  "tasksPage.inboxHint": "마감과 시간을 추가해서 계획하세요.",
  "tasksPage.today": "오늘",
  "tasksPage.upcoming": "예정",
  "tasksPage.someday": "언젠가",
  "tasksPage.somedayHint": "여유 시간에만.",
  "tasksPage.completed": "완료됨",
};

export default tasksPage;
