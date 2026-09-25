import type source from "../en/shell";

const shell: Partial<Record<keyof typeof source, string>> = {
  "shell.archive": "記録",
  "shell.close": "閉じる",
  "shell.dismiss": "却下",
  "shell.lines": "ライン",
  "shell.notSaved": "保存されていません・{error}",
  "shell.preparingRoute": "ルートを準備中",
  "shell.settings": "設定",
  "shell.signalLost": "信号喪失",
  "shell.tasks": "タスク",
  "shell.tonight": "今夜",
  "shell.primaryNav": "メインメニュー",
};

export default shell;