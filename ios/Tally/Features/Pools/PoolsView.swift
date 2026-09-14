import SwiftUI
import TallyKit

/**
 The pool switcher, opened from the lockup in the header.

 It is deliberately *not* a tab. Switching pools swaps the whole app — pool, session, board, header
 — because `AppModel` only ever holds one, so this is a context switch rather than a destination,
 and the header is where iOS puts those (a workspace picker, an account picker). Home is the tab
 that lists pools; this is the two-tap way to change which one you are standing in.

 Three jobs, in the order you need them: switch, join, and see what else there is to play.
 */
struct PoolsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.paper.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "Your pools")
                            ForEach(model.catalog.pools) { pool in
                                let current = pool.ref == model.pool
                                Button {
                                    model.switchPool(pool.ref)
                                    dismiss()
                                } label: {
                                    HStack(spacing: 12) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(pool.name).font(TallyFont.display(17))
                                            Text("\(pool.poolType) · \(pool.ref.host)").sans(12).foregroundStyle(Color.ink2)
                                        }
                                        Spacer()
                                        if current { Chip(text: "Open", fill: .flag) }
                                    }
                                    .padding(12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.cardPress)
                                .modifier(TallyCard(hard: current, fill: .white, border: .ink, radius: TallyRadius.card, dashed: false))
                                .contextMenu {
                                    if model.catalog.pools.count > 1 {
                                        Button("Remove from this phone", role: .destructive) { model.removePool(pool.id) }
                                    }
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "Join another pool")
                            Text("Paste the link your commissioner sent. Tapping one in Messages opens it here too.").sans(14).foregroundStyle(Color.ink2)
                            TextField("https://playtally.app/p/…", text: $link)
                                .tallyField(font: TallyFont.sans(15))
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.URL)
                            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
                            Button("Open pool") {
                                guard let url = URL(string: link.trimmingCharacters(in: .whitespaces)), PoolRef.parse(url) != nil else {
                                    error = "That doesn't look like a pool link."
                                    return
                                }
                                model.open(url)
                                dismiss()
                            }
                            .buttonStyle(.tally(.primary, size: .small))
                            .disabled(link.isEmpty)
                        }

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
                                            .foregroundStyle(type.status == .live ? .white : Color.ink2)
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
            .navigationTitle("Pools")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}
