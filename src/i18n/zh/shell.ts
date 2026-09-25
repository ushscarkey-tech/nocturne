import type source from "../en/shell";

const shell: Partial<Record<keyof typeof source, string>> = {
  "shell.tonight": "今晚",
  "shell.tasks": "任务",
  "shell.lines": "线路",
  "shell.archive": "记录",
  "shell.settings": "设置",
  "shell.signalLost": "信号丢失",
  "shell.preparingRoute": "准备你的路线",
  "shell.notSaved": "未保存 · {error}",
  "shell.dismiss": "关闭",
  "shell.close": "关闭",
};

export default shell;
