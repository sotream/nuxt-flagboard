"""
Writes public/brand/flagboard-wordmark.svg: the pennant mark and the word "Flagboard" as outlined paths, so the
logo renders without any font. Run once, by hand, with the throwaway virtual environment from
public/fonts/PROVENANCE.md (fonttools installed) and the source TTF of Geologica downloaded there:

    python scripts/outline-wordmark.py path/to/geologica.ttf > public/brand/flagboard-wordmark.svg

The text uses plain glyph advances (no kerning), at weight 600 and sharpness 100 (the title style of the app).
"""
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

WORD = "Flagboard"
SIZE = 18  # px, cap height about 12.6 px
MARK_SCALE = 1.5  # the 16 px mark drawn at 24 px


def main(path: str) -> None:
    font = instancer.instantiateVariableFont(
        TTFont(path), {"wght": 600, "SHRP": 100, "CRSV": 0, "slnt": 0}
    )
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = SIZE / font["head"].unitsPerEm
    x = 0.0
    paths = []
    for char in WORD:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        # Font units go up, SVG goes down: flip y, scale, then move to the text origin.
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, 34 + x, 17.5)))
        paths.append(pen.getCommands())
        x += font["hmtx"][name][0] * scale
    width = round(34 + x + 2, 1)
    d = " ".join(paths)
    print(
        f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="24" viewBox="0 0 {width} 24" role="img" aria-label="Flagboard">
  <style>
    .word {{ fill: #161618; }}
    .line {{ stroke: #161618; }}
    .accent {{ fill: #0a6aa6; }}
    @media (prefers-color-scheme: dark) {{ .word {{ fill: #ecece9; }} .line {{ stroke: #ecece9; }} .accent {{ fill: #5fb4e8; }} }}
  </style>
  <g transform="scale({MARK_SCALE})">
    <path d="M3.5 2v12.5" class="line" fill="none" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M4.25 3.75H9.5V7.75H4.25z" class="accent" stroke="none"/>
    <path d="M3.5 3h8.5l-2 2.75 2 2.75H3.5" class="line" fill="none" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <path class="word" d="{d}"/>
</svg>"""
    )


if __name__ == "__main__":
    main(sys.argv[1])
