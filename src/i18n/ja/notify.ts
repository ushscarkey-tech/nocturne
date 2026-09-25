import type source from "../en/notify";

const notify: Partial<Record<keyof typeof source, string>> = {
  "notify.departs": "あと5分で発車",
  "notify.platform": "{platform}番線 · {at}",
  "notify.dueToday": "今日締め切り",
  "notify.dueTomorrow": "あと1日",
  "notify.dueIn": "あと{n}日",
  "notify.left": "{task} · 残り{min}",
};

export default notify;
