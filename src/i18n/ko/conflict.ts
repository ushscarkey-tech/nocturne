import type source from "../en/conflict";

const conflict: Partial<Record<keyof typeof source, string>> = {
  "conflict.routeConflict": "노선 충돌",
  "conflict.notEnoughTime": "{date}까지 운행 시간이 부족해요.",
  "conflict.resolve": "해결",
  "conflict.addStudyTime": "공부 시간 추가",
  "conflict.taskSingular": "할 일",
  "conflict.taskPlural": "할 일",
  "conflict.involved": "포함됨",
  "conflict.resolveTitle": "노선 충돌 해결",
  "conflict.clearTitle": "노선 정리됨",
  "conflict.eyebrow": "운행 시간 vs 마감",
  "conflict.required": "필요함",
  "conflict.available": "사용 가능",
  "conflict.shortfall": "부족분",
  "conflict.deadlinePlus": "마감 +2일",
  "conflict.reduceBy30m": "30분 줄이기",
  "conflict.delayToSomeday": "언젠가로 미루기",
  "conflict.done": "완료",
  "conflict.everythingFits": "이제 모든 게 마감 전에 들어가요.",
  "conflict.resolutionNote": "우선순위가 낮은 할 일부터 나열됩니다. 시간을 더 주거나, 일의 양을 줄이거나, 다른 날로 미루세요.",
};

export default conflict;
