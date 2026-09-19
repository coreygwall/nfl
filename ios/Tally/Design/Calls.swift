import AVFoundation
import Foundation
import TallyKit

/**
 What the app says out loud when a hole goes in.

 `Haptics` is what the app feels like; this is the other half of the same moment. A swipe closes
 the hole, the word lands on the page, the phone buzzes — and a voice calls it. The voice is a
 recording rather than speech synthesis on purpose: the whole point is that it is *somebody's*
 voice, the one in the group who says "birdie" the way the group says it.

 Four decisions hold this together, and the first is the one everything else is arranged around:

 - **Nothing is bundled yet, and that is a working state, not a broken one.** `Resources/Calls/`
   is empty until somebody records into it. Every path through here is silent and cheap when a
   file is missing, no call site checks first, and the feature lights up the moment a file lands
   with no code change — the file's *name* is the wiring. A placeholder beep would have been worse
   than silence: it would ship, and then it would be the sound the app makes.
 - **It never stops the music.** Somebody in the cart has something playing, and an app that kills
   it to say "par" gets muted for the rest of the round. This is the whole reason the category is
   set at all: the default is `.soloAmbient`, which *pauses* other audio, so an `AVAudioPlayer`
   left to its own devices would have stopped the music on the first hole.
 - **It obeys the ring/silent switch**, which is what `.ambient` means and is the right call for a
   voice that shouts BOGEY — a phone flipped to silent has been given an instruction. The menu row
   says *out loud* rather than *on* for this reason. Both of those follow from `.ambient` and they
   travel together: the word is heard over music rather than ducking it, and the alternative
   (`.playback` with `.duckOthers`, which is the only category ducking is legal on) buys the duck
   by overriding the silent switch. If a recording ever turns out to be lost under somebody's
   playlist, that is the trade to reopen, and it is a two-line change here.
 - **A word is loaded once and kept.** Players are cached by word, so the second birdie of the
   round decodes nothing. There are eight of them and they are a second each; this is not a memory
   question.
 */
enum Calls {
    /// Where the preference lives. Absent means on, like every other preference in the app.
    static let preferenceKey = "tally.golf.calls"

    /**
     The formats a recording may arrive in, tried in this order.

     Deliberately generous: somebody recording on a phone gets `.m4a`, somebody exporting from a
     desktop editor gets `.wav` or `.aiff`, and having to convert a file before the app will say
     it is exactly the kind of friction that means the files never get made. `m4a` is first
     because it is the one to record if you are choosing.
     */
    static let formats = ["m4a", "caf", "aac", "mp3", "wav", "aiff"]

    /// The folder inside the app's resources. Also tried flat, because a synchronised folder in
    /// Xcode may copy its contents to the bundle root rather than keeping the directory.
    private static let folder = "Calls"

    // MARK: The switch

    /// Whether to say the word at all. Mirrors `@AppStorage(Calls.preferenceKey)`, so a menu bound
    /// to that key and this property are the same fact.
    static var isOn: Bool {
        get { UserDefaults.standard.object(forKey: preferenceKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: preferenceKey) }
    }

    /**
     Whether this build has any recordings in it at all.

     The menu's mute row is drawn only when this is true. A switch for a feature that cannot make
     a sound is decoration, and decoration beside real controls is how somebody learns to stop
     reading them. Computed once — the bundle does not change while the app is running.
     */
    static let hasVoice: Bool = ScrambleTally.callNames.contains { Calls.url(for: $0) != nil }

    // MARK: Saying it

    /**
     Call a hole, and say how long that will take.

     The duration is the point of the return value: `RoundView` holds the stamp over the page until
     the word has finished, so a long "biiiirdie" is not cut off by the next tee sliding up. Nil
     means nothing is going to be said — no file, switched off, or the session refused — and the
     caller falls back to its own timing.
     */
    @discardableResult
    static func hole(score: Int, par: Int) -> TimeInterval? {
        guard isOn, let player = player(for: ScrambleTally.callName(score: score, par: par)) else { return nil }
        guard session() else { return nil }
        current?.stop()
        player.currentTime = 0
        guard player.play() else { return nil }
        current = player
        return player.duration
    }

    /// Stop mid-word. For leaving the round while something is still being said.
    static func hush() {
        current?.stop()
        current = nil
    }

    // MARK: Machinery

    private static var cache: [String: AVAudioPlayer] = [:]
    /// Held because an `AVAudioPlayer` nobody is holding stops playing.
    private static var current: AVAudioPlayer?
    private static var ready = false

    private static func url(for word: String) -> URL? {
        for format in formats {
            if let found = Bundle.main.url(forResource: word, withExtension: format, subdirectory: folder) {
                return found
            }
            if let flat = Bundle.main.url(forResource: word, withExtension: format) {
                return flat
            }
        }
        return nil
    }

    private static func player(for word: String) -> AVAudioPlayer? {
        if let cached = cache[word] { return cached }
        guard let url = url(for: word), let made = try? AVAudioPlayer(contentsOf: url) else { return nil }
        made.prepareToPlay()
        cache[word] = made
        return made
    }

    /**
     Claim the audio session, once, the first time there is something to say.

     Not at launch: this app is silent for whole seasons at a time, and taking the session on the
     off chance is how an app ends up on the list of things that interfered with somebody's music.
     There is nothing to give back afterwards — an `.ambient` session interrupts nothing and ducks
     nothing — so this is set up once and left, rather than churned around every hole.

     False means a phone on a call or recording something. Neither is a moment to insist on saying
     "bogey", and neither is an error anybody wants to read.
     */
    private static func session() -> Bool {
        if ready { return true }
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
            ready = true
        } catch {
            return false
        }
        return true
    }
}
