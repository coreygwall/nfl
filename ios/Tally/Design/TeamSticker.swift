import SwiftUI
import TallyKit

/// A team's logo drawn as a sticker: a little tilt that is fixed per team, a lift when selected,
/// a check badge in the team's colour, greyed when the other side was picked.
struct TeamSticker: View {
    let team: Team
    var size: CGFloat = 72
    var selected = false
    /// Not chosen — the other side of a matchup while you are picking. Pushed right back.
    var dimmed = false
    /// Beaten. Held back, but nothing like as far as `dimmed`: the surrounding pill has already
    /// gone red, and a logo at a fifth of its colour on a pink ground reads as washed out rather
    /// than as lost. It also keeps its size, so a row of finished picks stays level.
    var lost = false
    /// Straight (no tilt) — used in lists.
    var flat = false

    private static func tilt(for abbr: String) -> Double {
        var h = 0
        for ch in abbr.unicodeScalars { h = (h * 31 + Int(ch.value)) % 997 }
        return Double(h % 9 - 4)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if UIImage(named: team.imageName) != nil {
                    Image(team.imageName)
                        .resizable()
                        .scaledToFit()
                        .shadow(color: selected ? Color.ink.opacity(0.22) : .clear, radius: 3, y: 4)
                } else {
                    Text(team.display)
                        .font(TallyFont.display(size * 0.34))
                        .foregroundStyle(.white)
                        .frame(width: size, height: size)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Color(hex: team.primary)))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.white, lineWidth: 2))
                        .accessibilityLabel(team.fullName)
                }
            }
            .frame(width: size, height: size)
            .grayscale(dimmed ? 0.7 : lost ? 0.55 : 0)
            .opacity(dimmed ? 0.4 : lost ? 0.65 : 1)
            .scaleEffect(selected ? 1.1 : dimmed ? 0.9 : 1)
            .rotationEffect(.degrees(selected || flat ? 0 : TeamSticker.tilt(for: team.abbr)))
            // A sticker goes on with a slap, not a fade. The spring is deliberately under-damped
            // so it overshoots and settles — which is what a thumb pressing a sticker down does.
            .animation(Motion.slap, value: selected)

            if selected {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color(hex: team.primary)))
                    .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
                    .shadow(color: Color.ink, radius: 0, x: 2, y: 2)
                    .offset(x: 4, y: -4)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: size, height: size)
        .animation(Motion.snap, value: dimmed)
        .accessibilityLabel(team.fullName)
    }
}
