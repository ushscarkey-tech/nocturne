import type source from "../en/auth";

const auth: Partial<Record<keyof typeof source, string>> = {
  "auth.alreadyTravelling": "もう旅をしていますか? ログイン",
  "auth.checkInbox": "メールを確認して、ログインしてください。",
  "auth.createAccount": "アカウント作成",
  "auth.createAccountForm": "アカウント作成",
  "auth.demoNote": "サンプルタスク、このブラウザのみ保存。",
  "auth.email": "メール",
  "auth.errorDefault": "何かエラーが起きました。",
  "auth.exploreDemo": "デモを見る",
  "auth.headline": "計画が変わっても壊れない計画機。",
  "auth.name": "名前",
  "auth.newHere": "初めてですか? アカウントを作成",
  "auth.noSupabase": "このブラウザに保存されています。",
  "auth.password": "パスワード",
  "auth.signIn": "ログイン",
  "auth.signInForm": "ログイン",
  "auth.signing": "一瞬待ってください…",
  "auth.tagline": "ルートを計画する。電車に乗る。進み続ける。",
};

export default auth;