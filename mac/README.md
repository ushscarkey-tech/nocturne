# Nocturne for Mac

A native shell around the web app, plus what only a Mac app can do:

- **Menu bar** (`MenuBarExtra`): the countdown on board / next departure,
  tonight's next stations, shortcuts. The Mac's counterpart to a Live
  Activity.
- **Floating window** (`FloatingPanel`): a small always-on-top card on every
  Space.
- **Widgets** (`NocturneWidget`): small, medium, large.

The main window is a `WKWebView` on the GitHub Pages app, so it is always
the latest version. The page reports tonight through
`window.webkit.messageHandlers.nocturne` (`src/lib/native.ts`,
`src/components/shell/NativeBridge.tsx`); the app keeps the last snapshot
and serves it to the widget on `127.0.0.1:47823`. The widget is sandboxed
and can't share files with the app without an Apple-issued app group.

## Build

GitHub Actions (`.github/workflows/mac.yml`) builds it on every change under
`mac/` and publishes `Nocturne.dmg` as the `mac-latest` release. Locally:

```
brew install xcodegen
cd mac && xcodegen generate && open Nocturne.xcodeproj
```

It is signed to run locally (ad hoc), not with a Developer ID, so macOS asks
once before opening it (System Settings → Privacy & Security → Open Anyway).
With an Apple Developer account, set `DEVELOPMENT_TEAM` and a Developer ID
identity in `project.yml` and notarize.
