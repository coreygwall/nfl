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
                        FlagMark(size: 36, bordered: false) {
                            Text("\(i + 1)").font(TallyFont.display(18))
                        }
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
 What the question mark opens, beside the megaphone on every one of the pool's tabs.

 **The rules belong to a pool, not to the app.** They lived under *About Tally* on the account
 tab, one heading below the app's version number, which said they were a fact about the software —
 and they are not: they are how *this* pool scores, from this pool's own type content, and a phone
 holding two pools would have had one page of settings claiming to explain both. So they moved to
 the pool's own bar, next to the other thing that belongs to one pool.

 **Beside the megaphone rather than on a page, for the same reason the megaphone is.** The question
 arrives mid-pick — what is the 5 for, can I still change this — and an answer that costs you your
 place in the flow is an answer people do without. A medium detent over whatever you were doing,
 draggable to full for the fine print, is the same shape the announcements peek uses, and the two
 controls now behave alike because they are the same kind of thing: a pool speaking to you.

 Home and the board still link to it in words (`LinkButton`), because that is where somebody
 browsing rather than picking goes looking.
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
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

/// The question mark in the pool's bar. Sized and padded to match `MegaphoneButton` exactly — they
/// sit next to each other, and iOS 26 draws a glass circle around each label, so two glyphs of
/// different weights would read as two different kinds of control.
struct RulesButton: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Button {
            Haptics.tap()
            model.showRules = true
        } label: {
            Image(systemName: "questionmark.circle.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.ink)
                .padding(6)
        }
        .accessibilityLabel("How \(model.poolName) works")
    }
}
