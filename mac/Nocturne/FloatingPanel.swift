import AppKit
import SwiftUI

/// A small card that stays above other windows on every Space, so the
/// countdown is in sight while you work in something else.
final class FloatingPanel: NSPanel {
    static let size = NSSize(width: 290, height: 124)

    init<Content: View>(content: Content) {
        super.init(
            contentRect: NSRect(origin: .zero, size: Self.size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        isMovableByWindowBackground = true
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        backgroundColor = .clear
        isOpaque = false
        hasShadow = true
        contentView = NSHostingView(rootView: content)
        if !setFrameUsingName("NocturneFloating"), let screen = NSScreen.main {
            let f = screen.visibleFrame
            setFrameOrigin(NSPoint(x: f.maxX - Self.size.width - 24, y: f.maxY - Self.size.height - 24))
        }
        setFrameAutosaveName("NocturneFloating")
    }

    override var canBecomeKey: Bool { true }
}

struct FloatingView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        NowView(snapshot: model.snapshot, date: model.now, bigSize: 30, progress: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(width: FloatingPanel.size.width, height: FloatingPanel.size.height, alignment: .leading)
            .background(
                ZStack {
                    VisualEffect()
                    Theme.night900.opacity(0.6)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.white.opacity(0.08)))
            .environment(\.colorScheme, .dark)
            .onTapGesture(count: 2) { model.showMain() }
            .contextMenu {
                Button(L10n.t("journey", model.snapshot?.locale)) { model.openJourney() }
                Button(L10n.t("open", model.snapshot?.locale)) { model.showMain() }
                Divider()
                Button(L10n.t("hideFloating", model.snapshot?.locale)) { model.toggleFloating() }
            }
    }
}

struct VisualEffect: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .hudWindow
        v.blendingMode = .behindWindow
        v.state = .active
        return v
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {}
}
