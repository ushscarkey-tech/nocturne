import type source from "../en/onboarding";

const onboarding: Partial<Record<keyof typeof source, string>> = {
  "onboarding.language": "语言",
  "onboarding.introA": "告诉它什么到期。",
  "onboarding.introB": "它找到截止前的时间。",
  "onboarding.introC": "夜晚变，路线也变。",
  "onboarding.nameQ": "叫你什么呢？",
  "onboarding.namePlaceholder": "名字",
  "onboarding.whenQ": "什么时候学习？",
  "onboarding.weekdays": "工作日",
  "onboarding.everyDay": "每天",
  "onboarding.presetEvening": "傍晚",
  "onboarding.presetSplit": "课后",
  "onboarding.presetLate": "深夜",
  "onboarding.custom": "稍后在运行时间里",
  "onboarding.firstTaskQ": "需要做一件事？",
  "onboarding.skip": "跳过",
  "onboarding.readyQ": "准备好。",
  "onboarding.start": "开始今晚",
  "onboarding.sample": "浏览示例任务",
  "onboarding.next": "下一步",
  "onboarding.step": "{n} / {total}",
};

export default onboarding;
