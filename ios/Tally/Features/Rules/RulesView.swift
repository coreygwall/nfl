import SwiftUI
import TallyKit

/// "How to play", from the pool type's own content — the same words as the site and the share card.
struct RulesView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let pool = model.poolType
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("THREE EASY STEPS").font(TallyFont.display(12)).tracking(2).foregroundStyle(Color.turf)
                Text("How to play \(model.poolName)").display(30)
                Text(pool.tagline).sans(16).foregroundStyle(Color.ink2)
            }
            HowToPlay(pool: pool, inApp: true)
            HStack(spacing: 8) {
                Button(model.player == nil ? "Join the pool" : "Back to my picks") {
                    // Rules is a sheet now, so "back to my picks" has to close it — otherwise it
                    // changes the tab behind the modal and looks like it did nothing.
                    model.showRules = false
                    if model.player == nil { model.showWelcome = true } else { model.tab = .picks }
                }.buttonStyle(.tally(.primary))
                Button("View the board") { model.showRules = false; model.tab = .board }.buttonStyle(.tally(.plain))
            }
        }
    }
}

/// The numbered steps and the fine print.
struct HowToPlay: View {
    let pool: PoolTypeContent
    var inApp = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(spacing: 12) {
                ForEach(Array(pool.steps.enumerated()), id: \.element.id) { i, step in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(i + 1)")
                            .font(TallyFont.display(18))
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Color.flag))
                        Text(step.title).display(20)
                        Text(step.body).sans(14).foregroundStyle(Color.ink2)
                        if step.showRanks {
                            HStack(spacing: 6) {
                                ForEach(Scoring.allRanks, id: \.self) { RankBadge(rank: $0, size: .small) }
                            }
                            .accessibilityLabel("Confidence values: 5, 4, 3, 2, and 1 points")
                        }
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                }
            }
            let notes = pool.notes(inApp: inApp)
            if !notes.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Good to know").display(24)
                    ForEach(notes) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Rectangle().fill(Color.ink).frame(height: 2)
                            Text(note.term).display(15).padding(.top, 8)
                            Text(note.body).sans(14).foregroundStyle(Color.ink2)
                        }
                    }
                }
            }
        }
    }
}

/**
 Rules stopped being a tab.

 It is a document you read once and then send to someone else — the only screen in the app you
 would visit fewer than five times in a season — and it was holding a quarter of the navigation.
 It opens over whatever you were looking at instead, from the board and from home, which is also
 where the question actually occurs to people.
 */
struct RulesSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    RulesView()
                        .padding(16)
                        .padding(.bottom, 40)
                }
            }
            .noZoom()
            .navigationTitle("How it works")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}
