import type source from "../en/auth";

const auth: Partial<Record<keyof typeof source, string>> = {
  "auth.headline": "계획이 틀어져도 끊어지지 않는 플래너.",
  "auth.tagline": "노선을 짜요. 기차를 타요. 계속 나아가요.",
  "auth.signInForm": "로그인",
  "auth.createAccountForm": "계정 만들기",
  "auth.name": "이름",
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.checkInbox": "이메일을 확인한 후 로그인해주세요.",
  "auth.errorDefault": "뭔가 잘못됐어요.",
  "auth.signing": "잠시만요…",
  "auth.signIn": "로그인",
  "auth.createAccount": "계정 만들기",
  "auth.newHere": "처음이세요? 계정을 만들어요",
  "auth.alreadyTravelling": "이미 여행 중이세요? 로그인",
  "auth.noSupabase": "이 브라우저에 저장돼요.",
  "auth.exploreDemo": "계정 없이 계속",
  "auth.demoNote": "이 브라우저에만 저장돼요.",
  "auth.errorCredentials": "이메일이나 비밀번호가 맞지 않아요.",
  "auth.errorEmail": "이메일 주소를 확인해 주세요.",
  "auth.errorEmailInUse": "이미 가입된 이메일이에요. 로그인해 주세요.",
  "auth.errorWeakPassword": "6자 이상으로 정해 주세요.",
  "auth.errorTooMany": "시도가 너무 많아요. 잠시 후에 다시.",
  "auth.errorNetwork": "연결이 없어요. 온라인일 때 다시 해 주세요.",
};

export default auth;
