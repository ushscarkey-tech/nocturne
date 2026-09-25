import type source from "../en/onboarding";

const onboarding: Partial<Record<keyof typeof source, string>> = {
  "onboarding.custom": "後で、運行時間で",
  "onboarding.everyDay": "毎日",
  "onboarding.firstTaskQ": "1つ必要なことはありますか?",
  "onboarding.introA": "期限を教えてください。",
  "onboarding.introB": "締め切り前に時間を見つけます。",
  "onboarding.introC": "夜が変わると、ルートも変わります。",
  "onboarding.language": "言語",
  "onboarding.namePlaceholder": "名前",
  "onboarding.nameQ": "あなたを何と呼びましょうか?",
  "onboarding.next": "次へ",
  "onboarding.presetEvening": "夜",
  "onboarding.presetLate": "夜遅く",
  "onboarding.presetSplit": "放課後",
  "onboarding.readyQ": "準備完了。",
  "onboarding.sample": "サンプルタスクで見て回る",
  "onboarding.skip": "スキップ",
  "onboarding.start": "今夜へ",
  "onboarding.step": "{n}/{total}",
  "onboarding.weekdays": "平日",
  "onboarding.whenQ": "いつ勉強しますか?",
};

export default onboarding;