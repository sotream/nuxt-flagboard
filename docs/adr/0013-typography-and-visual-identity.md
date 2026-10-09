# 0013. Typography, tokens and the visual identity of the admin UI

- Status: accepted
- Date: 2026-10-09

## Context

The admin UI looked like a default Tailwind template. It is a developer tool in a portfolio, so the feel should be
calm, precise and dense: strong type hierarchy, thin borders, near-monochrome colour with one accent, readable status
pills. Hard constraints: no request to any third party (a visitor's address must not leave the origin), full German
coverage, Cyrillic welcome, WCAG AA in both themes, and no UI kit.

## Decision

- **Fonts: Geologica for the interface and headings, Geist Mono for keys, ids and code.** Both are variable fonts under
  the SIL Open Font License 1.1, committed as woff2 subsets in `apps/web/public/fonts/` with their licence texts.
  Geologica keeps two axes: `wght` (body at 420, titles at 600) and `SHRP` (sharpness). `SHRP` is set to 100 only on
  the 22 px page title and the 28 px rollout figure, nothing under 20 px, because the sharper terminals show at large
  sizes and are invisible at 13 px. The `CRSV` and `slnt` axes are removed (no italic in the interface).
  Geist Mono has `wght` only.
- **The files are committed and never fetched** at build time or at run time. `public/fonts/PROVENANCE.md` has the
  exact upstream commits, hashes and commands; a unit test checks the SHA-256 of every shipped file against it.
- **Tokens, once.** `app/assets/css/tokens.css` is the only file with colour values: a neutral scale, the accent, and
  semantic colours (on, off, kill switch, warning, danger, live) for light and dark, as CSS variables. `main.css`
  maps them into Tailwind v4 with `@theme inline` and switches off the default palette and the large radii, so a
  palette class cannot be used by accident. A unit test rejects palette classes, `dark:` variants, raw colours and
  shadows in components. A second test computes the contrast of every pair in both themes.
- **One accent, steel-azure** (`#0A6AA6` light, `#5FB4E8` dark), used for the primary action, the active tab, the
  rollout state and the focus ring. A partial rollout is the product's central idea, so it is the accent's meaning;
  the logo's filled part says the same.
- **Brand and icons.** A pennant on a pole whose left part is filled (a rollout that reached part of its users); a
  wordmark drawn as outlines so it needs no font; a favicon set. Twenty icons on a 16 px grid, 1.5 px stroke, round
  caps, `currentColor`, drawn by hand and rendered by one `AppIcon` component from constant data.
- **Self-contained output.** `apps/web/scripts/check-external-refs.mjs` fails the build when the generated site names
  any other host or a missing file; it runs in CI and in the web image build. The CSP keeps `font-src 'self'` and
  `img-src 'self' data:`.

## Alternatives

| Pairing                                                    | Why not                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Onest + JetBrains Mono                                     | Good and calm, but the least distinctive; kept as the runner-up.                                                         |
| Bricolage Grotesque (headings) + Golos Text + Martian Mono | Most character, but 100 KB for Latin alone, a very wide mono that eats table width, and no Cyrillic in the display face. |
| Manrope + JetBrains Mono                                   | Reads best at small sizes, but closest to a generic SaaS look.                                                           |
| Geist as the sans                                          | Free and variable, but strongly associated with one product; the brief asked for qualities, not branding.                |
| Commissioner, Wix Madefor Text                             | No tabular figures, which the percentage columns need.                                                                   |
| Hanken Grotesk, Schibsted Grotesk, Instrument Sans         | No Cyrillic.                                                                                                             |
| `CRSV` and `slnt` axes of Geologica                        | About 21 KB more for features the interface does not use.                                                                |

All candidates were checked from their font files (character map, axes, feature tables), not from memory.

## Provenance

Source files come from the `google/fonts` repository, at the commit that last changed each file, downloaded on
2026-10-09. They are committed in this repository and never fetched at build or run time.

|                           | Geologica                                                          | Geist Mono                                                         |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Path                      | `ofl/geologica/Geologica[CRSV,SHRP,slnt,wght].ttf`                 | `ofl/geistmono/GeistMono[wght].ttf`                                |
| Upstream commit           | `1df853d271883511f51912529ec580044d412d39` (2023-04-13)            | `9e25e2ba265e5298f70f6182dd4e8a3ebf1b9123` (2026-05-20)            |
| SHA-256 of the source TTF | `9124d9e88ac6c11d761f35241713a51d68e2c4ebedce0edaca834717a00959ec` | `d00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196` |
| Git blob SHA              | `9e7771e32575873bba48b16b6ef1696b63087a2a`                         | `173867dce0580ea751e4b9c558740d34f20ce549`                         |
| Licence                   | SIL OFL 1.1, text below                                            | SIL OFL 1.1, text below                                            |

## Payload (measured)

| File                       | Bytes             | Loaded                                                    |
| -------------------------- | ----------------- | --------------------------------------------------------- |
| `geologica-latin.woff2`    | 32,776            | always, preloaded                                         |
| `geist-mono-latin.woff2`   | 22,428            | always                                                    |
| `geologica-cyrillic.woff2` | 18,508            | only when a Cyrillic character is shown (`unicode-range`) |
| Latin visitor              | 55,204 (53.9 KiB) |                                                           |
| With Cyrillic              | 73,712 (72.0 KiB) |                                                           |

The `SHRP` axis costs about 5 KB on the Latin file and 3 KB on the Cyrillic file. Coverage was verified from the
files: the German set (`ä ö ü Ä Ö Ü ß „ “ ” ‚ ‘ ’ – — … € •`) is present in both Latin files, Ukrainian letters in the
Cyrillic file, Latin Extended-A is 126 of 128 glyphs in Geologica and 115 of 128 in Geist Mono, and `tnum` is present
in Geologica.

## Fallback metrics and layout shift (measured)

Local fallback faces carry the metrics of Geologica, measured as the summed width of 20 real interface strings and
8 headings against Arial and Arial Bold, and from the `hhea` table: Arial, 108.05% size adjust, 90.23% ascent, 25.45%
descent; Arial Bold, 102.41%, 95.21%, 26.85%; Courier New for Geist Mono, 100%, 100.5%, 29.5%.

On a test page of 674 elements with the font delayed by 1.5 s (Chromium, macOS), the swap moved 644 elements with raw
Arial (up to 22 px, page 22 px taller) and 644 with `system-ui` (up to 4 px); with the adjusted fallback no element
moved vertically (180 moved horizontally, by up to 21 px) and the page height was unchanged. The browser's own CLS
metric read about zero in all three runs because the moving content was below the fold, so it is not evidence; the
geometry numbers are. Windows and Linux fallbacks were not measured.

## Consequences

- No external request exists to leak a visitor's address, and a check keeps it that way.
- Changing a colour means editing `tokens.css`; a component that uses a palette class fails a test.
- Subsetting needs Python `fonttools` once, outside the repository; the commands are recorded, the result is committed.
- `theme-color` follows the system theme, not the in-app toggle (changing it would need a script, which the CSP
  forbids). Firefox and Safari rendering is untested, and `color-mix()` in the rollout meter falls back to a flat
  colour where it is unsupported.

## Appendix: licence texts

### Geologica

```
Copyright 2020 The Geologisk Project Authors (https://github.com/monokromskriftforlag/geologisk)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

### Geist Mono

```
Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
