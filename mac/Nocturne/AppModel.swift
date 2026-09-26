import AppKit
import SwiftUI
import WidgetKit

/// Everything the Mac side knows about tonight, and the windows around it.
@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published private(set) var snapshot: Snapshot?
    /// Ticks every second for the menu bar countdown.
    @Published private(set) var now = Date()
    @Published private(set) var floatingVisible = false

    private let server = SnapshotServer()
    private var web: WebController?
    private var floating: FloatingPanel?
    private var ticker: Timer?
    private var widgetKey = ""

    private init() {
        if let data = UserDefaults.standard.data(forKey: "snapshot"), let s = Snapshot.decode(data), !s.isStale {
            snapshot = s
            server.update(data)
        }
        server.start()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.now = Date() }
        }
    }

    /// Called once the app has launched.
    func start() {
        showMain()
        if UserDefaults.standard.bool(forKey: "floating") { toggleFloating() }
    }

    func receive(_ data: Data) {
        guard let s = Snapshot.decode(data) else { return }
        snapshot = s
        UserDefaults.standard.set(data, forKey: "snapshot")
        server.update(data)
        // Widgets only need a new timeline when the plan itself changes.
        let key = [
            s.state,
            s.current?.station ?? "",
            String(Int((s.current?.endsAt.timeIntervalSince1970 ?? 0) / 60)),
            s.next?.station ?? "",
            String(Int(s.next?.at.timeIntervalSince1970 ?? 0)),
            String(s.remaining),
        ].joined(separator: "|")
        if key != widgetKey {
            widgetKey = key
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    private var webController: WebController {
        if let web { return web }
        let made = WebController(model: self)
        web = made
        return made
    }

    func showMain() { webController.show() }
    func openJourney() { webController.show(path: "journey/") }
    func reload() { webController.reload() }

    func toggleFloating() {
        let panel = floating ?? FloatingPanel(content: FloatingView(model: self))
        floating = panel
        if panel.isVisible {
            panel.orderOut(nil)
            floatingVisible = false
        } else {
            panel.orderFrontRegardless()
            floatingVisible = true
        }
        UserDefaults.standard.set(floatingVisible, forKey: "floating")
    }
}
