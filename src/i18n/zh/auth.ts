import type source from "../en/auth";

const auth: Partial<Record<keyof typeof source, string>> = {
  "auth.headline": "不会被打乱的计划者。",
  "auth.tagline": "规划路线。上车。继续行进。",
  "auth.signInForm": "登录",
  "auth.createAccountForm": "新建账户",
  "auth.name": "名字",
  "auth.email": "邮箱",
  "auth.password": "密码",
  "auth.checkInbox": "确认邮箱，然后登录。",
  "auth.errorDefault": "出错了。",
  "auth.signing": "稍候…",
  "auth.signIn": "登录",
  "auth.createAccount": "新建账户",
  "auth.newHere": "初来乍到？新建账户",
  "auth.alreadyTravelling": "已在旅途中？登录",
  "auth.noSupabase": "仅保存在此浏览器。",
  "auth.exploreDemo": "浏览演示",
  "auth.demoNote": "示例任务，仅保存在此浏览器。",
};

export default auth;
