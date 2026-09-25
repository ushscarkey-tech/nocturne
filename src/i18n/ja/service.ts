import type source from "../en/service";

const service: Partial<Record<keyof typeof source, string>> = {
  "service.addService": "運行を追加",
  "service.addWindow": "ウィンドウを追加",
  "service.addWindowOnDay": "{day}にウィンドウを追加",
  "service.backToTonight": "今夜",
  "service.blockTime": "時間をブロック",
  "service.chooseAtLeastOneDay": "少なくとも1日選んでください。",
  "service.day": "日",
  "service.days": "日",
  "service.daysLabel": "日",
  "service.editService": "運行を編集",
  "service.everyWeek": "毎週",
  "service.extra": "余分",
  "service.extraTime": "余分な時間を追加",
  "service.lateNightsNote": "深夜は同じ夜として数えられ、4:00まで。",
  "service.nextSevenDays": "次7日間・{min}",
  "service.noService": "運行なし",
  "service.oneOffChanges": "1回限りの変更",
  "service.oneOffDescription": "余分な時間、または夜をスキップ。",
  "service.pauseDescription": "このウィンドウを一時停止します。削除はしません。",
  "service.paused": "、一時停止中",
  "service.running": "実行中",
  "service.title": "運行時間",
  "service.weekSummary": "駅はこれらの時間のみ動きます。",
  "service.whenYouCanStudy": "勉強できる時間",
  "service.windowLabel": "{day} {start}から{end}{paused}",
};

export default service;