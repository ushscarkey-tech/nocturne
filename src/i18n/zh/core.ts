import type source from "../en/core";

const core: Partial<Record<keyof typeof source, string>> = {
  "change.headline": "路线已更新",
  "change.lowFocus": "先做些轻松的。{task} 在后面。",
  "change.signalSharp": "{task} 顺应你的清醒期提前。",
  "change.signalLow": "暂时缩短停靠。{task} 在后面。",
  "change.rebalanced": "站点已重排。",
  "change.lateStart": "{at} 发车。",
  "change.finishEarly": "提前完成。后续站点都提前。",
  "change.moreTime": "后续站点延后。",
  "change.skip": "今晚跳过。",
  "change.next": "{task} 在后面。",
  "change.history": "你通常在 {at} 附近状态最佳，所以 {task} 提前安排。",
  "change.returned": "{task} 的另外 {min} 移至 {at}。",
  "change.returnedLater": "{task} 的另外 {min} 留待他日。",
  "change.rests": "{task} 今晚暂停。",
  "change.deferred": "{task}（{min}）移至他日。",
  "change.joins": "{task}（{min}）在 {at} 加入。",
  "arrival.stays": "到达时间仍为 {at}。",
  "arrival.ahead": "{at} 到达，提前。",
  "arrival.later": "{at} 到达。",
  "arrival.none": "今晚没有其他站点。",
};

export default core;
