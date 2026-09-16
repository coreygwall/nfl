import SwiftUI
import TallyKit

/**
 Announcements, in the two sizes a phone needs them.

 The web puts the feed on a route and a preview on the pool home. A phone has four tabs and none of
 them is going to become "Announcements", so the same jobs are done by a peek and a sheet, both
 opened from the megaphone in the navigation bar of every tab:

 - `AnnouncementPeekSheet` is what the megaphone opens — the unread ones, in a medium detent, over
   whatever you were doing. Reading a notice should not cost you your place in a pick flow.
 - `AnnouncementsFeedSheet` is the whole thing, with the composer and the switch for whoever runs
   the pool.

 Both read one feed off `AppModel`, so the badge and the sheets can never disagree about what is
 unread.
 */

// MARK: The megaphone

/// The navigation-bar control, with the unread count on it.
struct MegaphoneButton: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Button {
            Haptics.tap()
            model.tapMegaphone()
        } label: {
            Image(systemName: "megaphone.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.ink)
                .overlay(alignment: .topTrailing) {
                    if let badge = model.unreadAnnouncementBadge {
                        Text(badge)
                            .font(TallyFont.sans(9, weight: .black))
                            .foregroundStyle(Color.onFill)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(Color.danger))
                            .offset(x: 9, y: -8)
                    }
                }
                // The badge hangs outside the glyph, and a navigation bar will happily clip it.
                .padding(.trailing, 8)
                .padding(.top, 6)
        }
        .accessibilityLabel(label)
    }

    private var label: String {
        let unread = model.unreadAnnouncements
        if unread == 0 { return "Announcements" }
        return "Announcements, \(Format.plural(unread, "unread message"))"
    }
}

// MARK: The peek

/**
 What the megaphone opens away from Home.

 It is deliberately not the feed: a medium detent over the picks you are in the middle of, showing
 what is new and nothing else, with two ways out — read one, or read them all. Whichever you pick,
 you chose it; the sheet never decided for you that you were done with what you were doing.
 */
struct AnnouncementPeekSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    private var unread: [PoolMessage] { model.unreadAnnouncementList }
    /// Nothing new is still worth opening — the last thing said is the thing you came to check.
    private var shown: [PoolMessage] { Array((unread.isEmpty ? model.messages : unread).prefix(3)) }

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if model.messages.isEmpty {
                            Text(model.announcementsEnabled ? "No announcements yet." : "Announcements are off.")
                                .sans(14).foregroundStyle(Color.ink2)
                        } else {
                            if unread.isEmpty {
                                Text("Nothing new. Here's the last one.")
                                    .sans(12, weight: .bold).foregroundStyle(Color.ink3)
                            }
                            ForEach(Array(shown.enumerated()), id: \.element.id) { index, message in
                                if index > 0 { DashedDivider() }
                                AnnouncementRow(message: message, canManage: false, preview: true) {
                                    model.openAnnouncementsFeed(focus: message.id)
                                }
                            }
                            if unread.count > shown.count {
                                Text("+\(unread.count - shown.count) more unread")
                                    .sans(12, weight: .bold).foregroundStyle(Color.ink2)
                            }
                        }
                        Button("View all announcements") { model.openAnnouncementsFeed() }
                            .buttonStyle(.tally(.plain, size: .small, fullWidth: true))
                            .padding(.top, 2)
                    }
                    .padding(16)
                    .padding(.bottom, 24)
                }
            }
            .noZoom()
            .navigationTitle("Announcements")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: The feed

/// Every announcement, plus the composer and the switch for whoever runs the pool.
struct AnnouncementsFeedSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var loadingMore = false

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            intro
                            if model.canPostAnnouncements { AnnouncementComposer() }
                            feed
                        }
                        .padding(16)
                        .padding(.bottom, 40)
                    }
                    .task(id: model.announcementFocusId) { await land(with: proxy) }
                }
            }
            .noZoom()
            .navigationTitle("Announcements")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .task {
            await model.refreshMessages()
            // Opening the feed *is* reading it, which is the one moment the badge should clear.
            model.markAnnouncementsRead()
        }
    }

    /// A tap on a preview said "that one there". Scroll to it and flash it, because a page of
    /// announcements all look alike and landing somewhere in the middle of one is not an answer.
    private func land(with proxy: ScrollViewProxy) async {
        guard let id = model.announcementFocusId else { return }
        // A frame for the rows to exist in before asking to be taken to one of them.
        try? await Task.sleep(for: .milliseconds(120))
        withAnimation(Motion.fade) { proxy.scrollTo(id, anchor: .top) }
        try? await Task.sleep(for: .milliseconds(2500))
        if model.announcementFocusId == id { model.announcementFocusId = nil }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Updates from your commissioners. Like a message to show you've seen it.")
                .sans(13).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            if model.canPostAnnouncements { settings }
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 6) {
            DashedDivider()
            Button {
                Task { await model.setAnnouncementsEnabled(!model.announcementsEnabled) }
            } label: {
                Label("Announcements \(model.announcementsEnabled ? "on" : "off")",
                      systemImage: model.announcementsEnabled ? "bell.fill" : "bell.slash.fill")
            }
            .buttonStyle(.tally(model.announcementsEnabled ? .turf : .plain, size: .small))
            .accessibilityAddTraits(model.announcementsEnabled ? .isSelected : [])
            Text("Only commissioners can post. Members can like; replies are off. Turning this off hides posts without deleting them.")
                .sans(12).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            DashedDivider()
        }
    }

    @ViewBuilder private var feed: some View {
        switch model.messageFeed {
        case .idle, .loading:
            BoardSkeleton(rows: 3)
        case .failed(let err):
            ErrorState(message: err.message) { Task { await model.refreshMessages() } }
        case .loaded:
            if model.messages.isEmpty {
                EmptyState(
                    title: model.announcementsEnabled ? "No announcements yet" : "Announcements are off",
                    body: model.canPostAnnouncements
                        ? "Anything you post here shows up on everyone's home screen."
                        : "Your commissioners haven't posted anything."
                )
            } else {
                ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
                    if index > 0 { DashedDivider() }
                    AnnouncementRow(message: message, canManage: model.canPostAnnouncements)
                        .id(message.id)
                }
                if model.hasMoreAnnouncements {
                    Button(loadingMore ? "Loading…" : "Older announcements") {
                        Task {
                            loadingMore = true
                            await model.loadMoreMessages()
                            loadingMore = false
                        }
                    }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(loadingMore)
                }
            }
        }
    }
}

// MARK: One announcement

/// One post: who said it, when, what, and the like that says you saw it.
struct AnnouncementRow: View {
    @Environment(AppModel.self) private var model
    let message: PoolMessage
    let canManage: Bool
    /// Previews clip the body and hand the whole row to the tap that opens the feed.
    var preview = false
    var onTap: (() -> Void)? = nil

    @State private var editing = false
    @State private var draft = ""
    @State private var saving = false
    @State private var confirmingDelete = false

    /// Previews never flash: the highlight is how the feed answers "that one there", and a row in
    /// a two-item card on Home is already the only thing it could be.
    private var highlighted: Bool { !preview && model.announcementFocusId == message.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            byline
            if editing {
                editor
            } else {
                body_
            }
            if !preview && !editing { actions }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(highlighted ? 10 : 0)
        .background {
            if highlighted {
                RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous)
                    .fill(Color.flagSoft)
            }
        }
        .animation(Motion.fade, value: highlighted)
        .contentShape(Rectangle())
        .onTapGesture { if let onTap { Haptics.tap(); onTap() } }
        .alert("Delete this announcement?", isPresented: $confirmingDelete) {
            Button("Delete", role: .destructive) { Task { await model.deleteAnnouncement(id: message.id) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The post and its likes go with it. This can't be undone.")
        }
    }

    private var byline: some View {
        HStack(spacing: 6) {
            Text(message.authorName).sans(13, weight: .bold).lineLimit(1)
            Chip(text: "Commissioner", fill: .paper2, size: 9)
            Spacer(minLength: 4)
            if preview, onTap != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink3)
                    .accessibilityHidden(true)
            }
        }
    }

    private var body_: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message.body)
                .sans(14)
                .lineLimit(preview ? 3 : nil)
                .fixedSize(horizontal: false, vertical: !preview)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(timestamp).sans(11).foregroundStyle(Color.ink3)
        }
    }

    private var timestamp: String {
        Format.relative(message.createdAt) + (message.wasEdited ? " · Edited" : "")
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button {
                Haptics.tap()
                Task { await model.toggleAnnouncementLike(message) }
            } label: {
                Label("\(message.likes)", systemImage: message.liked ? "hand.thumbsup.fill" : "hand.thumbsup")
            }
            .buttonStyle(.tally(message.liked ? .turf : .plain, size: .small))
            .disabled(!model.canReactToAnnouncements)
            .accessibilityLabel("\(message.liked ? "Unlike" : "Like") \(message.authorName)'s announcement. \(Format.plural(message.likes, "like")).")
            if canManage {
                Button("Edit") {
                    draft = message.body
                    withAnimation(Motion.fade) { editing = true }
                }
                .buttonStyle(.tally(.ghost, size: .small))
                // The colour goes on the text rather than the button: `.ghost` sets its label's
                // foreground, and a modifier closer to the `Text` is the one that wins.
                Button { confirmingDelete = true } label: {
                    Text("Delete").foregroundStyle(Color.danger)
                }
                .buttonStyle(.tally(.ghost, size: .small))
            }
            Spacer(minLength: 0)
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 8) {
            AnnouncementEditor(text: $draft, disabled: saving)
            HStack(spacing: 8) {
                Button(saving ? "Saving…" : "Save changes") {
                    Task {
                        saving = true
                        if await model.editAnnouncement(id: message.id, body: draft.trimmingCharacters(in: .whitespacesAndNewlines)) { editing = false }
                        saving = false
                    }
                }
                .buttonStyle(.tally(.primary, size: .small))
                .disabled(saving || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Cancel") { withAnimation(Motion.fade) { editing = false } }
                    .buttonStyle(.tally(.ghost, size: .small))
                    .disabled(saving)
            }
        }
    }
}

// MARK: Writing

/// The composer at the top of the feed. Commissioners only, and only while the feed is on — posting
/// into a switched-off feed writes to an audience of one.
private struct AnnouncementComposer: View {
    @Environment(AppModel.self) private var model
    @State private var draft = ""
    @State private var posting = false
    @FocusState private var focused: Bool

    var body: some View {
        if model.announcementsEnabled {
            VStack(alignment: .leading, spacing: 8) {
                Text("Message to the pool").sans(13, weight: .bold)
                AnnouncementEditor(text: $draft, disabled: posting, focused: $focused)
                HStack {
                    Text("\(draft.count)/\(messageMaxLength)")
                        .sans(11)
                        .foregroundStyle(draft.count > messageMaxLength ? Color.danger : Color.ink3)
                    Spacer()
                    Button(posting ? "Posting…" : "Post announcement") {
                        Task {
                            posting = true
                            if await model.postAnnouncement(draft.trimmingCharacters(in: .whitespacesAndNewlines)) {
                                draft = ""
                                focused = false
                            }
                            posting = false
                        }
                    }
                    .buttonStyle(.tally(.primary, size: .small))
                    .disabled(posting || !canPost)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardFlat(fill: .paper2)
        }
    }

    private var canPost: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.count <= messageMaxLength
    }
}

/// The one text box both the composer and an edit use, so they cannot drift apart.
private struct AnnouncementEditor: View {
    @Binding var text: String
    var disabled: Bool
    var focused: FocusState<Bool>.Binding? = nil

    var body: some View {
        let editor = TextEditor(text: $text)
            .font(TallyFont.sans(15))
            .scrollContentBackground(.hidden)
            .frame(minHeight: 96)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous).fill(Color.surface))
            .overlay(RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous).strokeBorder(Color.cardBorder, lineWidth: 2))
            .disabled(disabled)
            .opacity(disabled ? 0.6 : 1)
        if let focused {
            editor.focused(focused)
        } else {
            editor
        }
    }
}
