import SwiftUI
import TallyKit

/**
 Joining a pool, starting one, and what else there is to play.

 This used to be the switcher as well, which is why it never felt like one: a list to switch with,
 a form to join with and a catalogue to read were three jobs on one sheet, and the one people
 came for was buried under the other two. Switching is the home tab now, and so is starting
 something — the carousel there is this catalogue with a thumb on it. What is left here is the
 long read: every type Tally plays, including the ones that are not built yet.

 The join half is `JoinPoolForm`, the same view the home tab's button opens on its own sheet. One
 form behind two doors, because an invitation explained twice is an invitation explained two
 slightly different ways.
 */
struct PoolsView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ZStack {
                Color.paper.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        JoinPoolForm(onJoined: { dismiss() })

                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "Start a pool")
                            HStack(spacing: 8) {
                                Text("Run your own").font(TallyFont.display(16))
                                Text("COMING SOON")
                                    .font(TallyFont.display(10)).tracking(0.8).foregroundStyle(Color.ink2)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(Capsule().fill(Color.paper2))
                                    .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                            }
                            Text("Pick a game, name it, share one link. Until then, a commissioner's link is the way in.")
                                .sans(14).foregroundStyle(Color.ink2)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "What Tally plays")
                            ForEach(PoolTypes.all) { type in
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 8) {
                                        Text(type.name).display(18)
                                        Text(type.status == .live ? "LIVE NOW" : "COMING SOON")
                                            .font(TallyFont.display(10)).tracking(0.8)
                                            .foregroundStyle(type.status == .live ? Color.onFill : Color.ink2)
                                            .padding(.horizontal, 8).padding(.vertical, 3)
                                            .background(Capsule().fill(type.status == .live ? Color.turf : Color.paper2))
                                            .overlay(Capsule().strokeBorder(type.status == .live ? Color.turf : Color.ink, lineWidth: 2))
                                    }
                                    Text(type.blurb).sans(14).foregroundStyle(Color.ink2)
                                    FlowLayout(spacing: 6) {
                                        ForEach(type.sports, id: \.self) { sport in
                                            Text(sport).sans(12).foregroundStyle(Color.ink2)
                                                .padding(.horizontal, 10).padding(.vertical, 2)
                                                .overlay(Capsule().strokeBorder(Color.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                                        }
                                    }
                                }
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .cardFlat()
                                .opacity(type.status == .live ? 1 : 0.8)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .noZoom()
            .navigationTitle("Join or start a pool")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}
