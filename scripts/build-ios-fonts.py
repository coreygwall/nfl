#!/usr/bin/env python3
"""
Static instances of the two web fonts for the iOS app.

The web ships variable fonts and picks weights in CSS. iOS can register a variable font too, but
SwiftUI addresses fonts by PostScript name, and the named instances inside these files carry
none — so each weight the app uses is frozen into its own small static file with a name that can
be typed into `.custom(_:size:)` and will resolve on every iOS version. Bricolage is instanced at
the width and optical size the web uses (`font-variation-settings: "wdth" 96, "opsz" 32`), so a
heading in the app measures the same as one on the site.

    pip install fonttools brotli && python3 scripts/build-ios-fonts.py

Both families are SIL Open Font License; the licences ride along in the same folder.
"""
from pathlib import Path
import shutil

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ios/Tally/Resources/Fonts"
FONTSOURCE = ROOT / "node_modules/@fontsource-variable"

FAMILIES = [
    {
        "src": FONTSOURCE / "bricolage-grotesque/files/bricolage-grotesque-latin-standard-normal.woff2",
        "license": FONTSOURCE / "bricolage-grotesque/LICENSE",
        "family": "Bricolage Grotesque",
        "ps": "BricolageGrotesque",
        "axes": {"opsz": 32, "wdth": 96},
        "weights": {"SemiBold": 600, "Bold": 700, "ExtraBold": 800},
    },
    {
        "src": FONTSOURCE / "inter/files/inter-latin-standard-normal.woff2",
        "license": FONTSOURCE / "inter/LICENSE",
        "family": "Inter",
        "ps": "Inter",
        "axes": {"opsz": 14},
        "weights": {"Regular": 400, "SemiBold": 600, "Bold": 700, "ExtraBold": 800},
    },
]


def set_name(font: TTFont, name_id: int, value: str) -> None:
    for rec in list(font["name"].names):
        if rec.nameID == name_id:
            font["name"].removeNames(nameID=name_id)
    font["name"].setName(value, name_id, 3, 1, 0x409)
    font["name"].setName(value, name_id, 1, 0, 0)


def build(spec: dict) -> None:
    for style, wght in spec["weights"].items():
        font = TTFont(spec["src"])
        font.flavor = None
        pinned = {**spec["axes"], "wght": wght}
        static = instancer.instantiateVariableFont(font, pinned, inplace=False, updateFontNames=False)
        full = f"{spec['family']} {style}"
        ps = f"{spec['ps']}-{style}"
        set_name(static, 1, spec["family"] if style in ("Regular", "Bold") else full)
        set_name(static, 2, style if style in ("Regular", "Bold") else "Regular")
        set_name(static, 3, ps)
        set_name(static, 4, full)
        set_name(static, 6, ps)
        set_name(static, 16, spec["family"])
        set_name(static, 17, style)
        static["OS/2"].usWeightClass = wght
        static["OS/2"].fsSelection = (static["OS/2"].fsSelection & ~(1 << 5 | 1 << 6)) | (1 << 5 if wght >= 700 else 1 << 6)
        static["head"].macStyle = (static["head"].macStyle & ~1) | (1 if wght >= 700 else 0)
        out = OUT / f"{ps}.ttf"
        static.save(out)
        print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
    shutil.copy(spec["license"], OUT / f"LICENSE-{spec['ps']}.txt")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for spec in FAMILIES:
        build(spec)
