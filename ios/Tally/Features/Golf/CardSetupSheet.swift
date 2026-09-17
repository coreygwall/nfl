import SwiftUI
import TallyKit

/**
 Starting a card, and changing one that is already going.

 The first tee is the worst place to fill in a form, so the defaults are the common case and every
 field is optional except the names: eighteen holes, par 72 laid out the way most courses are, a
 name taken from today's date. The course and the pars can be corrected from the same sheet later,
 which is why this is one screen rather than a wizard — the round has usually started by the time
 anybody notices the fourth is a par three.

 Editing an existing card cannot remove a player who already has shots kept: their name is on holes
 that are already in. Shortening a round to nine leaves holes 10-18 on disk and simply stops
 counting them, so a mis-tap does not throw away the back nine.
 */
struct CardSetupSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    @Environment(\.dismiss) private var dismiss
    /// Nil starts a new card.
    let editing: ScrambleCard?

    @State private var name = ""
    @State private var course = ""
    @State private var rows: [PlayerDraft] = (0..<4).map { _ in PlayerDraft() }
    @State private var pars: [Int] = CardSetupSheet.standardPars
    @State private var holeCount = 18
    @State private var showPars = false
    @State private var loaded = false
    @State private var confirmDelete = false

    /// Par 72 as most cards lay it out: four threes, four fives, ten fours.
    static let standardPars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4]

    /**
     One line of the name list while it is being edited.

     It carries the *player's* id rather than relying on its position, because a name cleared in the
     middle used to shift every id below it up a row — which would have handed one person's kept
     shots to the next name down. `player` is nil for a row that is not on the card yet.
     */
    struct PlayerDraft: Identifiable, Hashable {
        let id = UUID()
        var player: String?
        var name: String = ""
    }

    private var filled: [PlayerDraft] { rows.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty } }
    private var trimmed: [String] { filled.map { $0.name.trimmingCharacters(in: .whitespaces) } }
    private var canSave: Bool { trimmed.count >= 2 && Set(trimmed.map { $0.lowercased() }).count == trimmed.count }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.paper.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        players
                        round
                        if showPars { parGrid }
                        details
                        if !canSave {
                            Text(trimmed.count < 2
                                 ? "Two names at least — a scramble needs somebody to choose between."
                                 : "Two people with the same name would be one row on the tally. Add an initial to one of them.")
                                .sans(13, weight: .semibold).foregroundStyle(Color.danger)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if editing != nil { deleteRow }
                    }
                    .padding(16)
                }
            }
            .noZoom()
            .navigationTitle(editing == nil ? "New golf card" : "Edit this card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(editing == nil ? "Start" : "Save") { save() }.disabled(!canSave)
                }
            }
            .onAppear { load() }
            // The same guard the card menu puts on the same act. This one needs it more: it sits
            // a thumb's width under the Save button somebody is aiming at.
            .confirmationDialog("Delete this card?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete the card", role: .destructive) {
                    guard let editing else { return }
                    golf.delete(editing.id)
                    model.leaveCard()
                    dismiss()
                }
                Button("Keep it", role: .cancel) {}
            } message: {
                Text("Every hole on it goes with it. There is no undo.")
            }
        }
    }

    // MARK: Sections

    private var players: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Who's playing")
            ForEach($rows) { $row in
                let index = rows.firstIndex { $0.id == row.id } ?? 0
                let removable = rows.count > 2 && !isLocked(row)
                HStack(spacing: 8) {
                    Text("\(index + 1)").font(TallyFont.display(14)).foregroundStyle(Color.ink3).frame(width: 16)
                    TextField(index < 2 ? "Name" : "Name (optional)", text: $row.name)
                        .tallyField()
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                    if rows.count > 2 {
                        Button {
                            Haptics.unpick()
                            rows.removeAll { $0.id == row.id }
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.system(size: 18))
                                .foregroundStyle(removable ? Color.ink3 : Color.line)
                        }
                        .buttonStyle(.plain)
                        .disabled(!removable)
                        .accessibilityLabel("Remove player \(index + 1)")
                    }
                }
            }
            if rows.count < 8 {
                Button("Add another") {
                    Haptics.tap()
                    rows.append(PlayerDraft())
                }
                .buttonStyle(.tally(.plain, size: .small))
            }
            if let locked = lockedNames, !locked.isEmpty {
                Text("\(Format.list(locked)) already has shots kept, so that name stays on the card.")
                    .sans(12).foregroundStyle(Color.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var round: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "The round")
            TallySegmented(
                value: Binding(get: { holeCount }, set: { setHoleCount($0) }),
                options: [(18, "18 holes"), (9, "Front 9")]
            )
            Button(showPars ? "Hide the pars" : "Set the pars") {
                Haptics.tap()
                withAnimation(Motion.fade) { showPars.toggle() }
            }
            .buttonStyle(.tally(.plain, size: .small))
            Text("Par \(pars.prefix(holeCount).reduce(0, +)). Only the pars matter for now — yardages and tees can come later.")
                .sans(12).foregroundStyle(Color.ink2)
        }
    }

    private var parGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
            ForEach(0..<holeCount, id: \.self) { index in
                VStack(spacing: 4) {
                    Text("\(index + 1)").sans(10, weight: .bold).foregroundStyle(Color.ink3)
                    HStack(spacing: 2) {
                        ForEach([3, 4, 5], id: \.self) { par in
                            Button {
                                Haptics.tap()
                                pars[index] = par
                            } label: {
                                Text("\(par)")
                                    .font(TallyFont.display(13))
                                    .foregroundStyle(pars[index] == par ? Color.paper : Color.ink2)
                                    .frame(width: 24, height: 26)
                                    .background(RoundedRectangle(cornerRadius: 8).fill(pars[index] == par ? Color.ink : Color.surface))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Hole \(index + 1), par \(par)")
                            .accessibilityAddTraits(pars[index] == par ? .isSelected : [])
                        }
                    }
                }
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .cardFlat()
            }
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Details")
            TextField(defaultName, text: $name).tallyField().textInputAutocapitalization(.words)
            TextField("Course (optional)", text: $course).tallyField().textInputAutocapitalization(.words)
        }
    }

    private var deleteRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            DashedDivider()
            LinkButton(title: "Delete this card", color: .danger) { confirmDelete = true }
            Text("Every hole on it goes with it. There is no undo.").sans(12).foregroundStyle(Color.ink3)
        }
        .padding(.top, 6)
    }

    // MARK: Rules

    /// The ids of players with shots already kept. Their names stay on the card: holes that are in
    /// are attributed to them, and a card cannot lose a name those holes point at.
    private var lockedIds: Set<String> {
        guard let editing else { return [] }
        return Set(ScrambleTally.rows(editing).filter { $0.kept > 0 }.map(\.player.id))
    }

    private func isLocked(_ row: PlayerDraft) -> Bool {
        guard let id = row.player else { return false }
        return lockedIds.contains(id)
    }

    private var lockedNames: [String]? {
        guard let editing else { return nil }
        let locked = lockedIds
        return editing.players.filter { locked.contains($0.id) }.map(\.name)
    }

    private var defaultName: String { "Saturday scramble" }

    private func setHoleCount(_ count: Int) {
        holeCount = count
        if pars.count < count { pars += Array(repeating: 4, count: count - pars.count) }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let editing else { return }
        name = editing.name
        course = editing.course
        rows = editing.players.map { PlayerDraft(player: $0.id, name: $0.name) }
        holeCount = editing.holeCount
        // The pars of a round that was shortened are kept, so lengthening it again finds them.
        pars = editing.pars.count >= 18 ? editing.pars : editing.pars + Array(CardSetupSheet.standardPars.dropFirst(editing.pars.count))
    }

    /// A locked player whose field was cleared keeps their name: the holes they are on say so.
    private func restoreLockedNames() {
        guard let editing else { return }
        let locked = lockedIds
        for index in rows.indices where rows[index].name.trimmingCharacters(in: .whitespaces).isEmpty {
            guard let id = rows[index].player, locked.contains(id) else { continue }
            rows[index].name = editing.players.first { $0.id == id }?.name ?? rows[index].name
        }
    }

    private func save() {
        restoreLockedNames()
        let finalName = name.trimmingCharacters(in: .whitespaces).isEmpty ? defaultName : name.trimmingCharacters(in: .whitespaces)
        let finalPars = Array(pars.prefix(holeCount))
        if var card = editing {
            // The id travels with the row, so a name edited, cleared or moved keeps its own shots.
            card.players = filled.map { row in
                GolfPlayer(
                    id: row.player ?? UUID().uuidString,
                    name: row.name.trimmingCharacters(in: .whitespaces)
                )
            }
            card.name = finalName
            card.course = course.trimmingCharacters(in: .whitespaces)
            card.pars = finalPars
            if !card.holeNumbers.contains(card.currentHole) { card.go(to: 1) }
            golf.save(card)
        } else {
            let card = ScrambleCard(
                name: finalName,
                course: course.trimmingCharacters(in: .whitespaces),
                players: trimmed.map { GolfPlayer(name: $0) },
                pars: finalPars
            )
            golf.save(card)
            golf.tab = .round
            model.switchToCard(card.id)
            Haptics.lockedIn()
        }
        dismiss()
    }
}
