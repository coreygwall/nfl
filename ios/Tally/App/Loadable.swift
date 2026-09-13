import Foundation
import TallyKit

/// A request's life, as a screen sees it.
enum Loadable<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(APIError)

    var value: Value? {
        if case .loaded(let v) = self { return v }
        return nil
    }

    var error: APIError? {
        if case .failed(let e) = self { return e }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    /// Loading again while old data is on screen keeps the old data, not a spinner.
    var isPending: Bool {
        switch self {
        case .idle, .loading: return true
        default: return false
        }
    }
}

extension Error {
    var asAPIError: APIError {
        (self as? APIError) ?? APIError(status: 0, code: "UNKNOWN", message: localizedDescription)
    }
}
