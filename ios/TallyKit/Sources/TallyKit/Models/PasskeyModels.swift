import Foundation

// The WebAuthn options the Worker hands back come straight from @simplewebauthn/server. Only the
// parts the native API needs are decoded; the rest is left where it is.

public struct PasskeyRegistrationOptions: Codable, Sendable {
    public struct RelyingParty: Codable, Sendable {
        public let id: String
        public let name: String?
    }
    public struct User: Codable, Sendable {
        /// base64url of the player id.
        public let id: String
        public let name: String
        public let displayName: String?
    }
    public struct Credential: Codable, Sendable {
        public let id: String
    }
    public let challenge: String
    public let rp: RelyingParty
    public let user: User
    public let excludeCredentials: [Credential]?
}

public struct PasskeyAuthenticationOptions: Codable, Sendable {
    public let challenge: String
    public let rpId: String
    public let userVerification: String?
}

public struct PasskeyRegistrationOptionsResponse: Codable, Sendable {
    public let challengeId: String
    public let options: PasskeyRegistrationOptions
}

public struct PasskeyAuthenticationOptionsResponse: Codable, Sendable {
    public let challengeId: String
    public let options: PasskeyAuthenticationOptions
}

public struct PasskeyAuthResponse: Codable, Sendable {
    public let player: Player
    public let token: String
}

public struct PasskeyRegisterResponse: Codable, Sendable {
    public let ok: Bool
    public let passkeys: Int
}

/// What the Worker verifies: the browser's `PublicKeyCredential` as JSON, which the native
/// credential is repackaged into so one server route serves both.
public struct PasskeyCredentialJSON: Codable, Sendable {
    public struct Response: Codable, Sendable {
        public let clientDataJSON: String
        public let attestationObject: String?
        public let authenticatorData: String?
        public let signature: String?
        public let userHandle: String?
        public let transports: [String]?
    }
    public let id: String
    public let rawId: String
    public let type: String
    public let response: Response
    public let clientExtensionResults: [String: JSONValue]
    public let authenticatorAttachment: String?
}

public struct PasskeyFinishRequest: Codable, Sendable {
    public let challengeId: String
    public let response: PasskeyCredentialJSON
}
