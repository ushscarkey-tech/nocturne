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
  "auth.exploreDemo": "不登录继续",
  "auth.demoNote": "只保存在这个浏览器里。",
  "auth.errorCredentials": "邮箱或密码不正确。",
  "auth.errorEmail": "请检查邮箱地址。",
  "auth.errorEmailInUse": "这个邮箱已注册，请直接登录。",
  "auth.errorWeakPassword": "至少 6 个字符。",
  "auth.errorTooMany": "尝试次数太多，请稍后再试。",
  "auth.errorNetwork": "没有网络，联网后再试。",
};

export default auth;
