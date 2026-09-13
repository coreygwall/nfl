import SwiftUI
import UIKit

/**
 The one thing SwiftUI still has no answer for: APNs hands the device token back through a UIKit
 delegate callback and nowhere else. This exists to catch it and pass it on, and does nothing else.
 */
final class AppDelegate: NSObject, UIApplicationDelegate {
    /// Set by `TallyApp` as soon as the model exists, which is before any registration can finish.
    @MainActor static weak var push: PushService?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in AppDelegate.push?.received(deviceToken: deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in AppDelegate.push?.failed(error) }
    }
}
