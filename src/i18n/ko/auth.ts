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
  "auth.exploreDemo": "데모 둘러보기",
  "auth.demoNote": "샘플 할 일, 이 브라우저에만 저장.",
};

export default auth;
