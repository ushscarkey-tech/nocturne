import type source from "../en/notify";

const notify: Partial<Record<keyof typeof source, string>> = {
  "notify.departs": "5분 뒤 출발",
  "notify.platform": "{platform}번 승강장 · {at}",
  "notify.dueToday": "오늘 마감",
  "notify.dueTomorrow": "하루 남음",
  "notify.dueIn": "{n}일 남음",
  "notify.left": "{task} · {min} 남음",
};

export default notify;
