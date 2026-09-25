import type source from "../en/notify";

const notify: Partial<Record<keyof typeof source, string>> = {
  "notify.departs": "5分钟后发车",
  "notify.platform": "{platform}号站台 · {at}",
  "notify.dueToday": "今天截止",
  "notify.dueTomorrow": "还剩1天",
  "notify.dueIn": "还剩{n}天",
  "notify.left": "{task} · 还剩{min}",
};

export default notify;
