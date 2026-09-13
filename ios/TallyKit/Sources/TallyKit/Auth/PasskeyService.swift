import Foundation
import AuthenticationServices

public enum PasskeyError: Error, LocalizedError, Equatable {
    /// The person waved the sheet away. Not a failure; never shown as one.
    case cancelled
    /// The device has no passkey for this domain (or the domain is not associated with the app).
    case noCredential
    case malformedOptions
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .cancelled: return "Cancelled."
        case .noCredential: return "No passkey for this device yet."
        case .malformedOptions: return "The sign-in options didn't make sense. Try again."
        case .failed(let m): return m
        }
    }
}

/**
 Face ID / Touch ID, natively. The same passkeys the web makes: Apple hands a domain's
 credentials to the app named in `/.well-known/apple-app-site-association` (worker/apple.ts),
 so a passkey created in Safari on playtally.app is offered here, and one created here shows up
 in Safari. The Worker sees the browser's JSON shape either way — `PasskeyCredentialJSON` is that
 repackaging — and verifies both against the same relying party.

 The relying party id comes from the server's options, which take it from the host being served;
 it must match an `webcredentials:` entry in the app's entitlements or the system refuses.
 */
@MainActor
public final class PasskeyService: NSObject {
    private var continuation: CheckedContinuation<ASAuthorization, Error>?
    private var controller: ASAuthorizationController?
    private let anchor: @MainActor () -> ASPresentationAnchor

    public init(anchor: @escaping @MainActor () -> ASPresentationAnchor) {
        self.anchor = anchor
    }

    /// Whether passkeys can be offered at all on this device.
    public static var supported: Bool { true }

    // MARK: Register

    public func register(_ options: PasskeyRegistrationOptions) async throws -> PasskeyCredentialJSON {
        guard let challenge = Base64URL.decode(options.challenge), let userID = Base64URL.decode(options.user.id) else {
            throw PasskeyError.malformedOptions
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rp.id)
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: options.user.name, userID: userID)
        request.userVerificationPreference = .preferred
        if #available(iOS 17.4, macOS 14.4, *) {
            request.excludedCredentials = (options.excludeCredentials ?? []).compactMap { cred in
                Base64URL.decode(cred.id).map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
            }
        }
        let authorization = try await perform([request])
        guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestation = credential.rawAttestationObject else {
            throw PasskeyError.failed("That passkey couldn't be created.")
        }
        let id = Base64URL.encode(credential.credentialID)
        return PasskeyCredentialJSON(
            id: id,
            rawId: id,
            type: "public-key",
            response: .init(
                clientDataJSON: Base64URL.encode(credential.rawClientDataJSON),
                attestationObject: Base64URL.encode(attestation),
                authenticatorData: nil,
                signature: nil,
                userHandle: nil,
                transports: ["internal", "hybrid"]
            ),
            clientExtensionResults: [:],
            authenticatorAttachment: "platform"
        )
    }

    // MARK: Sign in

    /// No identity yet: the credential names the player, so nothing is typed.
    public func assert(_ options: PasskeyAuthenticationOptions) async throws -> PasskeyCredentialJSON {
        guard let challenge = Base64URL.decode(options.challenge) else { throw PasskeyError.malformedOptions }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .preferred
        let authorization = try await perform([request])
        guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw PasskeyError.failed("That passkey couldn't be used.")
        }
        let id = Base64URL.encode(credential.credentialID)
        return PasskeyCredentialJSON(
            id: id,
            rawId: id,
            type: "public-key",
            response: .init(
                clientDataJSON: Base64URL.encode(credential.rawClientDataJSON),
                attestationObject: nil,
                authenticatorData: Base64URL.encode(credential.rawAuthenticatorData),
                signature: Base64URL.encode(credential.signature),
                userHandle: credential.userID.isEmpty ? nil : Base64URL.encode(credential.userID),
                transports: nil
            ),
            clientExtensionResults: [:],
            authenticatorAttachment: "platform"
        )
    }

    // MARK: Plumbing

    private func perform(_ requests: [ASAuthorizationRequest]) async throws -> ASAuthorization {
        if continuation != nil { throw PasskeyError.failed("Another sign-in is already in progress.") }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: requests)
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<ASAuthorization, Error>) {
        let c = continuation
        continuation = nil
        controller = nil
        switch result {
        case .success(let auth): c?.resume(returning: auth)
        case .failure(let err): c?.resume(throwing: err)
        }
    }

    public static func translate(_ error: Error) -> PasskeyError {
        if let p = error as? PasskeyError { return p }
        if let authError = error as? ASAuthorizationError {
            switch authError.code {
            case .canceled: return .cancelled
            case .failed, .invalidResponse, .notHandled, .notInteractive: return .failed("That passkey couldn't be verified.")
            default: return .failed(authError.localizedDescription)
            }
        }
        return .failed(error.localizedDescription)
    }
}

// The system calls these on the main thread; saying so lets the main-actor class take them.
extension PasskeyService: ASAuthorizationControllerDelegate {
    nonisolated public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated { finish(.success(authorization)) }
    }

    nonisolated public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated { finish(.failure(PasskeyService.translate(error))) }
    }
}

extension PasskeyService: ASAuthorizationControllerPresentationContextProviding {
    nonisolated public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated { anchor() }
    }
}

/// The two passkey journeys, end to end, against the Worker.
public enum PasskeyFlows {
    /// Adds Face ID / Touch ID to the identity this device is already signed in as.
    @MainActor
    public static func addPasskey(service: PoolService, passkeys: PasskeyService) async throws -> Int {
        let options = try await service.passkeyRegistrationOptions()
        let credential = try await passkeys.register(options.options)
        return try await service.finishPasskeyRegistration(challengeId: options.challengeId, credential: credential).passkeys
    }

    /// Signs in with a passkey. The credential says who you are, so there is no name to type.
    @MainActor
    public static func signIn(service: PoolService, passkeys: PasskeyService) async throws -> Identity {
        let options = try await service.passkeyAuthenticationOptions()
        let credential = try await passkeys.assert(options.options)
        let res = try await service.finishPasskeyAuthentication(challengeId: options.challengeId, credential: credential)
        return Identity(player: res.player, token: res.token, accountId: res.player.id)
    }
}
