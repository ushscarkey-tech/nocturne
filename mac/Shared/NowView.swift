import SwiftUI

/// The one thing that matters right now: the station on board and its
/// countdown, or the next departure. Shared by the floating window and the
/// widgets; countdowns tick on their own (no timer needed).
struct NowView: View {
    let snapshot: Snapshot?
    let date: Date
    var bigSize: CGFloat = 32
    var progress = false

    var body: some View {
        let lang = snapshot?.locale
        VStack(alignment: .leading, spacing: 3) {
            switch snapshot?.moment(at: date) ?? .empty {
            case .riding(let c):
                Eyebrow(text: "\(L10n.t("onBoard", lang)) · \(c.station)", tint: Theme.lamp)
                Text(timerInterval: date...max(date, c.endsAt), countsDown: true)
                    .font(.system(size: bigSize, weight: .light, design: .monospaced))
                    .foregroundStyle(Theme.lamp)
                    .lineLimit(1)
                TaskLine(text: c.task)
                if progress {
                    ProgressView(timerInterval: c.endsAt.addingTimeInterval(-Double(max(1, c.minutes) * 60))...c.endsAt, countsDown: true) {
                        EmptyView()
                    } currentValueLabel: {
                        EmptyView()
                    }
                    .progressViewStyle(.linear)
                    .tint(Theme.lamp)
                    .padding(.top, 4)
                }
            case .paused(let c):
                Eyebrow(text: "\(L10n.t("paused", lang)) · \(c.station)", tint: Theme.mist)
                Text(countdown(TimeInterval(c.remainingSec)))
                    .font(.system(size: bigSize, weight: .light, design: .monospaced))
                    .foregroundStyle(Theme.paperDim)
                TaskLine(text: c.task)
            case .waiting(let n):
                Eyebrow(text: "\(L10n.t("departure", lang)) · \(n.station)", tint: Theme.mist)
                Text(n.at.clock)
                    .font(.system(size: bigSize, weight: .light, design: .monospaced))
                    .foregroundStyle(Theme.lamp)
                TaskLine(text: n.task)
            case .stop(let n):
                Eyebrow(text: L10n.t("stop", lang), tint: Theme.mist)
                Text(n.at.clock)
                    .font(.system(size: bigSize, weight: .light, design: .monospaced))
                    .foregroundStyle(Theme.paper)
                TaskLine(text: "\(n.station) · \(n.task)")
            case .done:
                Eyebrow(text: "NOCTURNE", tint: Theme.mist)
                Text(L10n.t("done", lang))
                    .font(.system(size: 15, design: .serif))
                    .foregroundStyle(Theme.paper)
            case .empty:
                Eyebrow(text: "NOCTURNE", tint: Theme.mist)
                Text(snapshot == nil ? L10n.t("openApp", lang) : L10n.t("empty", lang))
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(Theme.paperDim)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct Eyebrow: View {
    let text: String
    var tint: Color = Theme.mist
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .tracking(1.2)
            .foregroundStyle(tint.opacity(0.9))
            .lineLimit(1)
    }
}

struct TaskLine: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(Theme.paper)
            .lineLimit(1)
    }
}

/// The next few stations, as on the departure board.
struct RouteList: View {
    let stops: [Snapshot.Stop]
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(stops) { s in
                HStack(spacing: 8) {
                    Text(s.at.clock)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(s.current ? Theme.lamp : Theme.mist)
                    Text(s.station)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.paperDim)
                        .lineLimit(1)
                    Text(s.task)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.paper)
                        .lineLimit(1)
                }
                .opacity(s.done ? 0.45 : 1)
            }
        }
    }
}

extension Snapshot {
    /// Stations still ahead (the one on board included).
    var ahead: [Stop] { stops.filter { !$0.done } }
}
