import type source from "../en/core";

const core: Partial<Record<keyof typeof source, string>> = {
  "change.headline": "ルート変更",
  "change.lowFocus": "先に軽めのタスク。次は{task}です。",
  "change.signalSharp": "冴えている今、{task}を先に。",
  "change.signalLow": "短めの停車で。次は{task}です。",
  "change.rebalanced": "駅が並び替わった。",
  "change.lateStart": "{at}に発車します。",
  "change.finishEarly": "早く終わった。後が繰り上がります。",
  "change.moreTime": "後の駅が後ろへ。",
  "change.skip": "今夜はスキップ。",
  "change.next": "次は{task}。",
  "change.history": "{at}ごろが得意だから、{task}を先に。",
  "change.returned": "{task}の残り{min}は{at}に移動。",
  "change.returnedLater": "{task}の残り{min}は別の日に。",
  "change.rests": "{task}は今夜休み。",
  "change.deferred": "{task}({min})は別の日へ。",
  "change.joins": "{task}({min})が{at}に参加。",
  "arrival.stays": "到着は変わらず{at}。",
  "arrival.ahead": "{at}に到着、予定より前倒し。",
  "arrival.later": "{at}に到着。",
  "arrival.none": "今夜の駅はここまで。",
};

export default core;
