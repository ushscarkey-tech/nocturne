import type source from "../en/shell";

const shell: Partial<Record<keyof typeof source, string>> = {
  "shell.tonight": "오늘 밤",
  "shell.tasks": "할 일",
  "shell.lines": "라인",
  "shell.archive": "기록",
  "shell.settings": "설정",
  "shell.signalLost": "신호 끊김",
  "shell.preparingRoute": "노선을 준비 중입니다",
  "shell.notSaved": "저장하지 못함 · {error}",
  "shell.dismiss": "닫기",
  "shell.close": "닫기",
  "shell.primaryNav": "주 메뉴",
};

export default shell;
