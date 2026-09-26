import SwiftUI
import WidgetKit

@main
struct NocturneWidgets: WidgetBundle {
    var body: some Widget {
        TonightWidget()
    }
}

struct TonightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Tonight", provider: TonightProvider()) { entry in
            TonightView(entry: entry)
                .containerBackground(for: .widget) { Theme.sky }
        }
        .configurationDisplayName(L10n.t("widgetName"))
        .description(L10n.t("widgetDesc"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TonightEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct TonightProvider: TimelineProvider {
    private static let cacheKey = "snapshot"

    func placeholder(in context: Context) -> TonightEntry {
        TonightEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TonightEntry) -> Void) {
        load { completion(TonightEntry(date: Date(), snapshot: $0)) }
    }

    /// One entry now, then one at each moment the picture changes by itself
    /// (a station ending, a train leaving), then ask again.
    func getTimeline(in context: Context, completion: @escaping (Timeline<TonightEntry>) -> Void) {
        load { snapshot in
            let now = Date()
            var moments: [Date] = []
            if let s = snapshot {
                if s.state == "riding", let c = s.current { moments.append(c.endsAt) }
                if let n = s.next { moments.append(n.at) }
            }
            let upcoming = moments.filter { $0 > now }.sorted()
            let entries = [TonightEntry(date: now, snapshot: snapshot)] + upcoming.map { TonightEntry(date: $0, snapshot: snapshot) }
            let refresh = min(upcoming.first ?? now.addingTimeInterval(15 * 60), now.addingTimeInterval(15 * 60))
            completion(Timeline(entries: entries, policy: .after(refresh)))
        }
    }

    /// Ask the running app; if it isn't running, show what it last said.
    private func load(_ done: @escaping (Snapshot?) -> Void) {
        var request = URLRequest(url: Snapshot.url)
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { data, _, _ in
            if let data, let fresh = Snapshot.decode(data) {
                UserDefaults.standard.set(data, forKey: Self.cacheKey)
                done(fresh)
                return
            }
            let cached = UserDefaults.standard.data(forKey: Self.cacheKey).flatMap(Snapshot.decode)
            done(cached.flatMap { $0.isStale ? nil : $0 })
        }.resume()
    }
}

struct TonightView: View {
    let entry: TonightEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .systemMedium:
                HStack(alignment: .top, spacing: 16) {
                    NowView(snapshot: entry.snapshot, date: entry.date, bigSize: 30, progress: true)
                    if let s = entry.snapshot, !s.ahead.isEmpty {
                        RouteList(stops: Array(s.ahead.prefix(4)))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            case .systemLarge:
                VStack(alignment: .leading, spacing: 16) {
                    NowView(snapshot: entry.snapshot, date: entry.date, bigSize: 40, progress: true)
                    if let s = entry.snapshot, !s.stops.isEmpty {
                        Divider().overlay(Color.white.opacity(0.08))
                        RouteList(stops: Array(s.stops.prefix(8)))
                    }
                    Spacer(minLength: 0)
                    if let s = entry.snapshot, s.remaining > 0 {
                        Eyebrow(text: String(format: L10n.t("stationsLeft", s.locale), s.remaining)
                            + (s.arrival.map { " · \(L10n.t("arrive", s.locale)) \($0.clock)" } ?? ""))
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 0) {
                    NowView(snapshot: entry.snapshot, date: entry.date, bigSize: 30)
                    Spacer(minLength: 0)
                    if let s = entry.snapshot, s.remaining > 0 {
                        Eyebrow(text: String(format: L10n.t("stationsLeft", s.locale), s.remaining))
                    }
                }
            }
        }
        .environment(\.colorScheme, .dark)
        .widgetURL(URL(string: "nocturne://journey"))
    }
}
