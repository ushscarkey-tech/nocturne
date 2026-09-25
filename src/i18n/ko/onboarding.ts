import type source from "../en/onboarding";

const onboarding: Partial<Record<keyof typeof source, string>> = {
  "onboarding.language": "언어",
  "onboarding.introA": "해야 할 일을 적으면,",
  "onboarding.introB": "마감 전까지 시간을 찾아 둡니다.",
  "onboarding.introC": "밤이 틀어지면, 노선도 따라 바뀝니다.",
  "onboarding.nameQ": "뭐라고 불러드릴까요?",
  "onboarding.namePlaceholder": "이름",
  "onboarding.whenQ": "언제 공부하세요?",
  "onboarding.weekdays": "평일",
  "onboarding.everyDay": "매일",
  "onboarding.presetEvening": "저녁",
  "onboarding.presetSplit": "방과 후",
  "onboarding.presetLate": "늦은 밤",
  "onboarding.custom": "나중에, 운행 시간에서",
  "onboarding.firstTaskQ": "해야 할 한 가지?",
  "onboarding.skip": "건너뛰기",
  "onboarding.readyQ": "준비됐어요.",
  "onboarding.start": "오늘 밤으로",
  "onboarding.sample": "샘플 할 일로 둘러보기",
  "onboarding.next": "다음",
  "onboarding.step": "{n}/{total}",
};

export default onboarding;
