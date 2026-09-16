import SwiftUI
import TallyKit

/**
 Which messages this phone wants, and about whom.

 Two levels because a household needs both. The top half is the kinds — plenty of people want the
 Sunday results and not the Thursday nudge — and the bottom half is the entries, which only appears
 when there is more than one, because a person running a single entry has nothing to choose
 between and a screen of controls that all say the same thing is worse than no screen.

 Every switch writes through to the server immediately. There is no Save button: this is a
 preference, not a form, and a preference that needs confirming is one people leave half set.
 */
struct NotificationSettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        switch model.notifyPrefs {
                        case .idle, .loading:
                            BoardSkeleton(rows: 3)
                        case .failed(let error):
                            ErrorState(message: error.message) { Task { await model.loadNotifyPrefs() } }
                        case .loaded(let prefs):
                            kinds(prefs)
                            if model.people.count > 1 { entries(prefs) }
                            footnote
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 40)
                }
            }
            .noZoom()
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .task { await model.loadNotifyPrefs() }
    }

    // MARK: Kinds

    private func kinds(_ prefs: NotifyPrefs) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "What to send")
            VStack(spacing: 0) {
                ForEach(Array(NotificationKind.allCases.enumerated()), id: \.element) { index, kind in
                    if index > 0 { DashedDivider().padding(.vertical, 10) }
                    SwitchRow(
                        title: kind.title,
                        detail: kind.detail,
                        isOn: prefs.isOn(kind),
                        busy: model.savingPrefs
                    ) { on in
                        Task { await model.setNotifyKind(kind, on: on) }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardFlat()
        }
    }

    // MARK: Entries

    private func entries(_ prefs: NotifyPrefs) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Who to tell you about")
            Text("You pick for \(Format.plural(model.people.count, "entry", "entries")). Switch one off to stop hearing about it on this phone — their picks still count.")
                .sans(12).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 0) {
                ForEach(Array(model.people.enumerated()), id: \.element.id) { index, person in
                    if index > 0 { DashedDivider().padding(.vertical, 10) }
                    SwitchRow(
                        title: person.name,
                        detail: summary(prefs, entry: person.id),
                        isOn: !prefs.isMuted(entry: person.id),
                        busy: model.savingPrefs
                    ) { on in
                        Task { await model.setNotifyEntry(person.id, on: on) }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardFlat()
        }
    }

    /// What this entry will actually hear, worked out through the same rule the server uses rather
    /// than described in the abstract — so the line under a name is a promise, not a summary of
    /// the controls above it.
    private func summary(_ prefs: NotifyPrefs, entry: String) -> String {
        if prefs.isMuted(entry: entry) { return "Nothing about this entry." }
        let on = NotificationKind.allCases.filter { prefs.allows($0, entry: entry) }
        if on.isEmpty { return "Nothing — every kind above is off." }
        if on.count == NotificationKind.allCases.count { return "Everything above." }
        return on.map(\.title).joined(separator: " · ")
    }

    private var footnote: some View {
        Text("These are for this phone. Another device you sign in on keeps its own.")
            .sans(12).foregroundStyle(Color.ink3)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A labelled switch with the sentence that says what it actually does.
private struct SwitchRow: View {
    let title: String
    let detail: String
    let isOn: Bool
    let busy: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(TallyFont.display(16))
                Text(detail)
                    .sans(12).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: Binding(get: { isOn }, set: onChange))
                .labelsHidden()
                .tint(Color.turf)
                .disabled(busy)
                .accessibilityLabel(title)
                .accessibilityHint(detail)
        }
    }
}
