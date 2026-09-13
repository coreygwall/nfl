import Foundation
import TallyKit
import UIKit
import UserNotifications

/**
 Notifications, from the app's side.

 The app's whole job here is to ask once, hand the resulting token to the Worker, and open the
 right screen when someone taps. Everything about *what* to send and *when* lives on the server,
 which is the only thing that knows a game has finished.

 Registration happens on every launch rather than once: APNs reissues tokens without telling
 anyone, and a stale token is a notification nobody ever sees.
 */
@MainActor
@Observable
public final class PushService: NSObject {
    public enum Permission: Equatable {
        case unknown
        case notAsked
        case granted
        case denied
    }

    public private(set) var permission: Permission = .unknown
    /// The token Apple last gave us, hex, or nil if we have not been given one.
    public private(set) var token: String?

    /// Where a tapped notification wants to go, for the shell to pick up and clear.
    public var pendingPath: String?

    private var register: ((String, PushEnvironment) async -> Void)?
    private var unregister: ((String) async -> Void)?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    /// Tell the service how to reach the server. Kept as closures so `TallyKit` stays unaware of
    /// UIKit and this stays testable without a pool.
    func connect(
        register: @escaping (String, PushEnvironment) async -> Void,
        unregister: @escaping (String) async -> Void
    ) {
        self.register = register
        self.unregister = unregister
    }

    /// What the system already thinks, without prompting anyone.
    func refreshPermission() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = switch settings.authorizationStatus {
        case .notDetermined: .notAsked
        case .denied: .denied
        case .authorized, .provisional, .ephemeral: .granted
        @unknown default: .unknown
        }
        // Being authorised is not the same as being registered: the token is per-install and is
        // handed back asynchronously, so ask for it again on every launch.
        if permission == .granted { UIApplication.shared.registerForRemoteNotifications() }
    }

    /**
     Ask. Deliberately not called at launch — a permission prompt in the first ten seconds is the
     one everybody declines. The app asks once the picks are in, when there is visibly something
     to be told about.
     */
    @discardableResult
    func requestPermission() async -> Bool {
        let centre = UNUserNotificationCenter.current()
        let granted = (try? await centre.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        permission = granted ? .granted : .denied
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    /// Called by the app delegate with whatever Apple handed back.
    func received(deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        token = hex
        let send = register
        Task { await send?(hex, PushEnvironment.current) }
    }

    func failed(_ error: Error) {
        // Not fatal, and not worth a dialogue: without a token we simply send nothing. It happens
        // on a simulator without a signed-in Apple account, which is most of them.
        print("push registration failed: \(error.localizedDescription)")
    }

    /// Signing out. The server should stop sending to a phone that is no longer this person's.
    func forget() async {
        guard let hex = token else { return }
        await unregister?(hex)
        token = nil
    }

    /// Re-registers under whoever is signed in now, after a sign-in or an entry switch.
    func reregister() {
        guard let hex = token else { return }
        let send = register
        Task { await send?(hex, PushEnvironment.current) }
    }
}

extension PushService: UNUserNotificationCenterDelegate {
    /// Someone tapped a notification. The path travelled with it, so there is nothing to look up.
    public nonisolated func userNotificationCenter(
        _ centre: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let tally = info["tally"] as? [String: Any], let path = tally["path"] as? String else { return }
        await MainActor.run { self.pendingPath = path }
    }

    /// Arriving while they are looking at the app. Show it — a result is still news when you are
    /// on the picks screen — but quietly, without a sound on top of whatever they are doing.
    public nonisolated func userNotificationCenter(
        _ centre: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }
}
