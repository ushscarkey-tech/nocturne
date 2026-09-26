import Foundation

/// The Mac app's own few words, in the traveller's language. Everything
/// about tonight (stations, tasks) already arrives translated from the page.
enum L10n {
    static func language(_ locale: String? = nil) -> String {
        let code = locale ?? Locale.preferredLanguages.first ?? "en"
        for l in ["ko", "ja", "zh"] where code.hasPrefix(l) { return l }
        return "en"
    }

    static func t(_ key: String, _ locale: String? = nil) -> String {
        let lang = language(locale)
        return table[lang]?[key] ?? table["en"]?[key] ?? key
    }

    static let table: [String: [String: String]] = [
        "en": [
            "onBoard": "On board",
            "departure": "Departure",
            "stop": "Station Stop · next departs",
            "paused": "On hold",
            "done": "Tonight's journey is over.",
            "empty": "Nothing on the line tonight.",
            "arrive": "Arrives",
            "stationsLeft": "%d stations left",
            "focused": "Focused tonight",
            "open": "Open Nocturne",
            "journey": "Go to the journey",
            "floating": "Floating window",
            "hideFloating": "Hide floating window",
            "reload": "Reload",
            "quit": "Quit Nocturne",
            "widgetName": "Tonight",
            "widgetDesc": "The station you're on and the next departure.",
            "openApp": "Open Nocturne to see tonight here.",
            "left": "left",
        ],
        "ko": [
            "onBoard": "탑승 중",
            "departure": "출발",
            "stop": "정차 중 · 다음 출발",
            "paused": "잠시 멈춤",
            "done": "오늘 밤 여행이 끝났어요.",
            "empty": "오늘 밤 노선이 비어 있어요.",
            "arrive": "도착",
            "stationsLeft": "정거장 %d곳 남음",
            "focused": "오늘 집중",
            "open": "Nocturne 열기",
            "journey": "여정으로 가기",
            "floating": "떠 있는 창",
            "hideFloating": "떠 있는 창 숨기기",
            "reload": "새로고침",
            "quit": "Nocturne 종료",
            "widgetName": "오늘 밤",
            "widgetDesc": "지금 타고 있는 정거장과 다음 출발을 보여줘요.",
            "openApp": "Nocturne을 열면 오늘 밤 노선이 여기 떠요.",
            "left": "남음",
        ],
        "ja": [
            "onBoard": "乗車中",
            "departure": "出発",
            "stop": "停車中・次便は",
            "paused": "一時停止",
            "done": "今夜の旅は終わりました",
            "empty": "今夜は路線が空いています",
            "arrive": "到着",
            "stationsLeft": "%d 駅残り",
            "focused": "今夜集中",
            "open": "Nocturne を開く",
            "journey": "旅へ",
            "floating": "ウィンドウを浮かせる",
            "hideFloating": "ウィンドウを非表示",
            "reload": "再読み込み",
            "quit": "Nocturne を終了",
            "widgetName": "今夜",
            "widgetDesc": "乗車中の駅と次の出発を表示",
            "openApp": "Nocturne を開いて今夜をここで見る",
            "left": "残り",
        ],
        "zh": [
            "onBoard": "乘车中",
            "departure": "出发",
            "stop": "停靠中·下班车",
            "paused": "暂停",
            "done": "今晚旅程结束",
            "empty": "今晚无班车",
            "arrive": "到达",
            "stationsLeft": "还剩 %d 站",
            "focused": "今晚专注",
            "open": "打开 Nocturne",
            "journey": "查看行程",
            "floating": "浮窗",
            "hideFloating": "隐藏浮窗",
            "reload": "刷新",
            "quit": "退出 Nocturne",
            "widgetName": "今晚",
            "widgetDesc": "显示当前车站和下班车",
            "openApp": "打开 Nocturne 查看今晚班次",
            "left": "剩余",
        ],
    ]
}
