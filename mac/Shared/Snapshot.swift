import Foundation

/// Tonight at a glance, as the Nocturne page reports it (see src/lib/native.ts).
/// Names and titles arrive already in the traveller's language.
struct Snapshot: Codable, Equatable {
    struct Current: Codable, Equatable {
        var station: String
        var task: String
        var endsAt: Date
        var remainingSec: Int
        var minutes: Int
    }

    struct Next: Codable, Equatable {
        var station: String
        var task: String
        var at: Date
        var minutes: Int
    }

    struct Stop: Codable, Equatable, Identifiable {
        var station: String
        var task: String
        var at: Date
        var minutes: Int
        var done: Bool
        var current: Bool
        var id: String { "\(station)-\(at.timeIntervalSince1970)" }
    }

    var v: Int
    var at: Date
    var locale: String
    /// empty · waiting · riding · paused · stop · done
    var state: String
    var current: Current?
    var next: Next?
    var stops: [Stop]
    var remaining: Int
    var arrival: Date?
    var focusedMinutes: Int

    /// Where the app serves the latest snapshot to its widget (loopback only).
    static let port: UInt16 = 47823
    static let url = URL(string: "http://127.0.0.1:47823/snapshot")!

    static func decode(_ data: Data) -> Snapshot? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            let text = try d.singleValueContainer().decode(String.self)
            let precise = ISO8601DateFormatter()
            precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = precise.date(from: text) ?? ISO8601DateFormatter().date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: d.codingPath, debugDescription: "Not a date: \(text)"))
        }
        return try? decoder.decode(Snapshot.self, from: data)
    }

    /// What to show at a moment: stations end and trains leave on their own
    /// schedule, so a widget entry for 21:50 shows the next departure even if
    /// the snapshot was taken while the station was still running.
    enum Moment: Equatable {
        case riding(Current)
        case paused(Current)
        case waiting(Next)
        case stop(Next)
        case done
        case empty
    }

    func moment(at date: Date) -> Moment {
        switch state {
        case "riding":
            if let c = current, c.endsAt > date { return .riding(c) }
            if let n = next { return .stop(n) }
            return .done
        case "paused":
            if let c = current { return .paused(c) }
            return .empty
        case "stop":
            if let n = next { return .stop(n) }
            return .done
        case "waiting":
            if let n = next { return .waiting(n) }
            return .empty
        case "done":
            return .done
        default:
            return .empty
        }
    }

    /// A snapshot from an earlier night says nothing about tonight.
    var isStale: Bool { Date().timeIntervalSince(at) > 16 * 3600 }
}

extension Date {
    /// 21:05
    var clock: String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: self)
    }
}

/// 1:05:09 / 23:41
func countdown(_ seconds: TimeInterval) -> String {
    let s = max(0, Int(seconds.rounded(.up)))
    let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%02d:%02d", m, sec)
}
