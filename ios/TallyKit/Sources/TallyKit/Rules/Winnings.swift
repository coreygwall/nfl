import Foundation

/**
 Real money, from `shared/winnings.ts`. The board is computed entirely by the Worker — the pot
 amounts and the splits it sends back are the truth — this enum exists only so both surfaces say
 the pot amounts the same way and print the same label. `winningsParity.test.ts` pins the two pot
 amounts together, because a Swift build cannot see the TypeScript and the cost of drift here is
 somebody's actual payout being wrong.
 */
public enum Winnings {
    public static let weeklyPot = 18.0
    public static let seasonPot = 51.0

    /// "$18", "$4.50" — always the currency, at most two decimals, and never a trailing zero
    /// nobody asked for. The same rule as `moneyLabel` in `shared/winnings.ts`.
    public static func label(_ amount: Double) -> String {
        let rounded = (amount * 100).rounded() / 100
        if rounded == rounded.rounded() {
            return "$\(Int(rounded))"
        }
        return String(format: "$%.2f", rounded)
    }
}
