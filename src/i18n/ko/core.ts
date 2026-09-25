import type source from "../en/core";

const core: Partial<Record<keyof typeof source, string>> = {
  "change.headline": "노선 변경",
  "change.lowFocus": "가벼운 것부터. 다음은 {task}.",
  "change.signalSharp": "또렷할 때 {task} 먼저.",
  "change.signalLow": "짧게 나눠 갑니다. 다음은 {task}.",
  "change.rebalanced": "정거장 순서를 바꿨어요.",
  "change.lateStart": "{at} 출발.",
  "change.finishEarly": "일찍 끝나 뒤 정거장이 당겨졌어요.",
  "change.moreTime": "뒤 정거장이 조금씩 밀려요.",
  "change.skip": "오늘은 건너뜀.",
  "change.next": "다음은 {task}.",
  "change.history": "어려운 일은 보통 {at} 무렵이 잘 돼서, {task} 먼저.",
  "change.returned": "{task} 남은 {min} → {at} 열차로 환승.",
  "change.returnedLater": "{task} 남은 {min} → 다른 날 열차로 환승.",
  "change.rests": "{task} · 오늘은 쉼.",
  "change.deferred": "{task} ({min}) → 다른 날 열차로 환승.",
  "change.joins": "{task} ({min}) · {at}에 승차.",
  "arrival.stays": "도착은 그대로 {at}.",
  "arrival.ahead": "{at} 도착 · 예정보다 빠름.",
  "arrival.later": "{at} 도착.",
  "arrival.none": "오늘 밤 정거장 끝.",
};

export default core;
