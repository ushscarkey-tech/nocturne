import SwiftUI

/// The app's night palette (src/app/globals.css).
enum Theme {
    static let night950 = Color(red: 0x04 / 255, green: 0x06 / 255, blue: 0x0a / 255)
    static let night900 = Color(red: 0x07 / 255, green: 0x0a / 255, blue: 0x10 / 255)
    static let night800 = Color(red: 0x10 / 255, green: 0x17 / 255, blue: 0x1f / 255)
    static let paper = Color(red: 0xef / 255, green: 0xe6 / 255, blue: 0xd3 / 255)
    static let paperDim = Color(red: 0xcd / 255, green: 0xc3 / 255, blue: 0xae / 255)
    static let mist = Color(red: 0x9a / 255, green: 0x97 / 255, blue: 0x8c / 255)
    static let lamp = Color(red: 0xdc / 255, green: 0xae / 255, blue: 0x6a / 255)
    static let signal = Color(red: 0xc9 / 255, green: 0x8a / 255, blue: 0x7a / 255)

    static var sky: LinearGradient {
        LinearGradient(colors: [night800, night900, night950], startPoint: .top, endPoint: .bottom)
    }
}
