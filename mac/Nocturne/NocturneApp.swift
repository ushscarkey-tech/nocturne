import AppKit
import SwiftUI

@main
struct NocturneApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @ObservedObject private var model = AppModel.shared

    var body: some Scene {
        // The menu bar is the Mac's Live Activity: the countdown stays in sight.
        MenuBarExtra {
            MenuContent(model: model)
        } label: {
            MenuLabel(model: model)
        }
        .menuBarExtraStyle(.menu)
        .commands { NocturneCommands(model: model) }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        MainActor.assumeIsolated { AppModel.shared.start() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { MainActor.assumeIsolated { AppModel.shared.showMain() } }
        return true
    }

    /// nocturne://journey from a widget.
    func application(_ application: NSApplication, open urls: [URL]) {
        MainActor.assumeIsolated {
            for url in urls where url.scheme == "nocturne" {
                if url.host == "journey" { AppModel.shared.openJourney() } else { AppModel.shared.showMain() }
            }
        }
    }
}

struct MenuLabel: View {
    @ObservedObject var model: AppModel

    var body: some View {
        switch model.snapshot?.moment(at: model.now) {
        case .riding(let c)?:
            HStack(spacing: 4) {
                Image(systemName: "tram.fill")
                Text(countdown(c.endsAt.timeIntervalSince(model.now))).monospacedDigit()
            }
        case .paused(let c)?:
            HStack(spacing: 4) {
                Image(systemName: "pause.fill")
                Text(countdown(TimeInterval(c.remainingSec))).monospacedDigit()
            }
        case .waiting(let n)?, .stop(let n)?:
            HStack(spacing: 4) {
                Image(systemName: "tram")
                Text(n.at.clock).monospacedDigit()
            }
        default:
            Image(systemName: "moon.stars")
        }
    }
}

struct MenuContent: View {
    @ObservedObject var model: AppModel

    var body: some View {
        let s = model.snapshot
        let lang = s?.locale
        ForEach(summary, id: \.self) { line in Text(line) }
        if let s, !s.ahead.isEmpty {
            Divider()
            ForEach(s.ahead.prefix(5)) { stop in
                Text("\(stop.at.clock)   \(stop.station) · \(stop.task)")
            }
        }
        Divider()
        Button(L10n.t("journey", lang)) { model.openJourney() }
            .keyboardShortcut("j")
        Button(model.floatingVisible ? L10n.t("hideFloating", lang) : L10n.t("floating", lang)) { model.toggleFloating() }
            .keyboardShortcut("f", modifiers: [.command, .shift])
        Button(L10n.t("open", lang)) { model.showMain() }
            .keyboardShortcut("o")
        Divider()
        Button(L10n.t("quit", lang)) { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }

    private var summary: [String] {
        let lang = model.snapshot?.locale
        switch model.snapshot?.moment(at: model.now) {
        case .riding(let c)?:
            return ["\(L10n.t("onBoard", lang)) · \(c.station) — \(countdown(c.endsAt.timeIntervalSince(model.now))) \(L10n.t("left", lang))", c.task]
        case .paused(let c)?:
            return ["\(L10n.t("paused", lang)) · \(c.station)", c.task]
        case .waiting(let n)?:
            return ["\(L10n.t("departure", lang)) \(n.at.clock) · \(n.station)", n.task]
        case .stop(let n)?:
            return ["\(L10n.t("stop", lang)) \(n.at.clock)", "\(n.station) · \(n.task)"]
        case .done?:
            return [L10n.t("done", lang)]
        case .empty?:
            return [L10n.t("empty", lang)]
        case nil:
            return [L10n.t("openApp", lang)]
        }
    }
}

struct NocturneCommands: Commands {
    @ObservedObject var model: AppModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {}
        CommandGroup(after: .windowArrangement) {
            Button(L10n.t("open")) { model.showMain() }
                .keyboardShortcut("0")
            Button(L10n.t("journey")) { model.openJourney() }
                .keyboardShortcut("j")
            Button(L10n.t("floating")) { model.toggleFloating() }
                .keyboardShortcut("f", modifiers: [.command, .shift])
        }
        CommandGroup(after: .toolbar) {
            Button(L10n.t("reload")) { model.reload() }
                .keyboardShortcut("r")
        }
    }
}
