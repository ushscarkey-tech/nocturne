import type source from "../en/service";

const service: Partial<Record<keyof typeof source, string>> = {
  "service.backToTonight": "오늘 밤",
  "service.whenYouCanStudy": "공부할 수 있는 시간",
  "service.title": "운행 시간",
  "service.weekSummary": "정거장은 이 시간에만 운행해요.",
  "service.nextSevenDays": "다음 7일 · {min}",
  "service.everyWeek": "매주",
  "service.addWindow": "시간 추가",
  "service.noService": "운행 없음",
  "service.windowLabel": "{day} {start}~{end}{paused}",
  "service.addWindowOnDay": "{day}에 시간 추가",
  "service.oneOffChanges": "특별 변경",
  "service.oneOffDescription": "추가 시간 또는 휴무일.",
  "service.extra": "추가",
  "service.extraTime": "추가 시간 넣기",
  "service.blockTime": "시간 차단",
  "service.chooseAtLeastOneDay": "최소 하루는 선택해주세요.",
  "service.editService": "운행 시간 편집",
  "service.addService": "운행 시간 추가",
  "service.day": "날",
  "service.days": "날",
  "service.daysLabel": "날",
  "service.lateNightsNote": "자정 이후는 같은 밤으로 간주하며, 04:00까지예요.",
  "service.running": "운행 중",
  "service.pauseDescription": "이 시간을 삭제하지 않고 일시 중지해요.",
  "service.paused": ", 일시 중지됨",
};

export default service;
