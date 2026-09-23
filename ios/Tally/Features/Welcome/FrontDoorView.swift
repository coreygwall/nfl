import SwiftUI
import TallyKit

/**
 What a phone that has never been in a pool sees: Tally, the two ways in, and a pool to look round.

 It exists because the app used to open straight into High Five. That was harmless while the only
 people installing were its players, and wrong the moment anyone else could: a stranger from the App
 Store landed on a private group's front page, roster and all, and could have joined it by typing a
 name. A pool is something you are invited to, so the first question is which one — the code
 somebody said, or the link they sent (`JoinPoolForm`, the same form the home tab uses).

 The demo pool is the third door, for somebody who has not been invited to anything yet and wants
 to see what the fuss is — and it is how App Review gets in without landing on real people's board.
 It is a separate Worker with its own database (`demo.playtally.app`), so nothing done there can
 reach a real pool.

 A tapped pool link never reaches this screen: `AppModel.open(_:)` takes the phone straight into
 that pool. Neither does anything that has been in a pool before, including after an update.
 */
struct FrontDoorView: View {
    @Environment(AppModel.self) private var model
    @State private var showRules = false

    var body: some View {
        ZStack {
            PaperBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    TallyHero()
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Join your pool").display(22)
                        Text("Pools are invite-only. Whoever runs yours has a code, and a link that opens it here.")
                            .sans(14).foregroundStyle(Color.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    JoinPoolForm()
                        .padding(16)
                        .cardFlat()
                    demo
                    HStack(spacing: 6) {
                        Text("Five picks a week, ranked.").sans(13).foregroundStyle(Color.ink3)
                        LinkButton(title: "How it plays", color: .ink2) { showRules = true }
                    }
                }
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 48)
            }
        }
        .sheet(isPresented: $showRules) {
            NavigationStack {
                ScrollView { RulesView().padding(20) }
                    .background(Color.paper)
                    .navigationTitle("How to play")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { showRules = false } } }
            }
        }
    }

    private var demo: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "No invite yet?")
            Text("Look around a demo pool. The players are made up, the games are real, and nothing you do there touches anyone's pool.")
                .sans(14).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Button("Look around the demo pool") {
                Haptics.tap()
                model.openDemo()
            }
            .buttonStyle(.tally(.plain, fullWidth: true))
        }
    }
}
