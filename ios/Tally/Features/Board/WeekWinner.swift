import SwiftUI
import TallyKit

/**
 Recognising who took the week.

 A pool is a weekly game, and until now the app treated the end of a week as the moment the numbers
 stopped changing. It is the moment somebody won. The board says so at the top for everyone, the
 winner's row wears it, and if it is you there is a card and a handful of paper.
 */

/// The banner above a finished week's board. One line, everyone sees the same one.
struct WeekWinnerBanner: View {
    let week: Int
    /// Everyone level at the top — usually one name, occasionally two.
    let winners: [String]
    let points: Int
    let isMe: Bool

    private var headline: String {
        if isMe && winners.count == 1 { return "You won Week \(week)" }
        if winners.count == 1 { return "\(winners[0]) won Week \(week)" }
        if isMe { return "You share Week \(week)" }
        return "Week \(week) is shared"
    }

    private var detail: String {
        let names = winners.count > 1 ? Format.list(winners) : winners.first ?? ""
        let tally = Format.plural(points, "point")
        return winners.count > 1 ? "\(names) tied on \(tally)." : "\(tally)."
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.flag))
                .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(headline).display(20)
                Text(detail).sans(13).foregroundStyle(Color.ink2)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: .flagSoft, border: .ink)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(headline). \(detail)")
    }
}

/**
 The moment itself, once per week per entry.

 Deliberately a card in the page rather than a sheet: a sheet has to be dismissed, and being made
 to tap "OK" to acknowledge your own good week is the opposite of a reward. This sits at the top of
 the board the first time you open it after the week settles, and can simply be scrolled past.
 */
struct WeekWinnerCard: View {
    let week: Int
    let points: Int
    let shared: Bool
    let onDone: () -> Void

    @State private var stamped = false

    var body: some View {
        VStack(spacing: 6) {
            Stamp(text: shared ? "Shared it" : "Won it", color: .flag)
                .rotationEffect(.degrees(-5))
                .scaleEffect(stamped ? 1 : 2.4)
                .opacity(stamped ? 1 : 0)
            Text(shared ? "You share Week \(week)." : "You won Week \(week).")
                .display(24)
                .multilineTextAlignment(.center)
            Text("\(Format.plural(points, "point")). Nicely done.")
                .sans(14).foregroundStyle(Color.ink2)
            Button("Nice", action: onDone)
                .buttonStyle(.tally(.turf, size: .small))
                .padding(.top, 6)
        }
        .padding(.vertical, 20)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .card(fill: .flagSoft)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.6)) { stamped = true }
        }
    }
}
