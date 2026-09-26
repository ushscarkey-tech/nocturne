import AppKit
import WebKit

/// The main window: Nocturne itself, as on the web (always the latest
/// version), plus a bridge so the page can tell the Mac what's happening.
@MainActor
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let home = URL(string: "https://ushscarkey-tech.github.io/nocturne/")!
    /// Safari's own, so sign-in providers treat the window like the browser.
    static let userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15"

    private weak var model: AppModel?
    let window: NSWindow
    let webView: WKWebView
    private var popups: [NSWindow] = []

    init(model: AppModel) {
        self.model = model
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        let handler = ScriptHandler()
        config.userContentController.add(handler, name: "nocturne")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.customUserAgent = Self.userAgent
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = NSColor(red: 7 / 255, green: 10 / 255, blue: 16 / 255, alpha: 1)

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 880),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Nocturne"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 7 / 255, green: 10 / 255, blue: 16 / 255, alpha: 1)
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 360, height: 560)
        window.isReleasedWhenClosed = false
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("NocturneMain")
        super.init()

        handler.onMessage = { [weak self] body in self?.receive(body) }
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.load(URLRequest(url: Self.home))
    }

    func show(path: String? = nil) {
        if let path, let url = URL(string: path, relativeTo: Self.home)?.absoluteURL {
            webView.load(URLRequest(url: url))
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func reload() {
        webView.reload()
    }

    private func receive(_ body: Any) {
        guard let message = body as? [String: Any],
              message["type"] as? String == "snapshot",
              let snapshot = message["snapshot"],
              JSONSerialization.isValidJSONObject(snapshot),
              let data = try? JSONSerialization.data(withJSONObject: snapshot)
        else { return }
        model?.receive(data)
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Links out of Nocturne open in the browser.
        if let url = action.request.url, action.navigationType == .linkActivated, action.targetFrame?.isMainFrame == true,
           url.host != Self.home.host, url.scheme == "https" || url.scheme == "http" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    /// Sign-in windows (Google) open as small windows of their own and report back to the page.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.customUserAgent = Self.userAgent
        popup.uiDelegate = self
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 640), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        w.isReleasedWhenClosed = false
        w.contentView = popup
        w.center()
        w.makeKeyAndOrderFront(nil)
        popups.append(w)
        return popup
    }

    func webViewDidClose(_ webView: WKWebView) {
        guard let w = popups.first(where: { $0.contentView === webView }) else { return }
        w.close()
        popups.removeAll { $0 === w }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
}

/// Kept separate so the web view's hold on it doesn't keep the controller alive.
@MainActor
final class ScriptHandler: NSObject, WKScriptMessageHandler {
    var onMessage: ((Any) -> Void)?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        onMessage?(message.body)
    }
}
