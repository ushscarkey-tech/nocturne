import type source from "../en/conflict";

const conflict: Partial<Record<keyof typeof source, string>> = {
  "conflict.addStudyTime": "学習時間を追加",
  "conflict.available": "利用可能",
  "conflict.clearTitle": "ルート確保",
  "conflict.deadlinePlus": "締め切り+2日",
  "conflict.delayToSomeday": "いつかに延期",
  "conflict.done": "完了",
  "conflict.everythingFits": "すべての締め切りに間に合うようになりました。",
  "conflict.resolutionNote": "優先度の低いタスクが最初にリストされます。もっと時間をあげるか、仕事を減らすか、別の日に延期してください。",
  "conflict.eyebrow": "運行時間 vs. 締め切り",
  "conflict.involved": "関係する",
  "conflict.notEnoughTime": "{date}前の運行時間が足りません。",
  "conflict.reduceBy30m": "30分減らす",
  "conflict.required": "必要",
  "conflict.resolve": "解決する",
  "conflict.resolveTitle": "ルートの衝突を解決",
  "conflict.routeConflict": "ルートの衝突",
  "conflict.shortfall": "不足分",
  "conflict.taskPlural": "タスク",
  "conflict.taskSingular": "タスク",
};

export default conflict;