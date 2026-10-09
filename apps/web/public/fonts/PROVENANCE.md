# Font provenance

The fonts in this directory are **committed to the repository**. They are never fetched at build time or at run
time, and no page, stylesheet or script requests a font from a third party. Both families are licensed under the
SIL Open Font License 1.1 (full texts: `OFL-Geologica.txt`, `OFL-GeistMono.txt`). The woff2 files are subsets of
the upstream fonts and are not renamed.

## Sources

Both come from the `google/fonts` repository, at the commit that last changed the file. Downloaded on 2026-10-09.

|                                | Geologica                                                                           | Geist Mono                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Path                           | `ofl/geologica/Geologica[CRSV,SHRP,slnt,wght].ttf`                                  | `ofl/geistmono/GeistMono[wght].ttf`                                                  |
| Upstream commit                | `1df853d271883511f51912529ec580044d412d39` (2023-04-13, "Geologica: Version 1.010") | `9e25e2ba265e5298f70f6182dd4e8a3ebf1b9123` (2026-05-20, "Geist Mono: Version 1.701") |
| SHA-256 of the source TTF      | `9124d9e88ac6c11d761f35241713a51d68e2c4ebedce0edaca834717a00959ec`                  | `d00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196`                   |
| Git blob SHA of the source TTF | `9e7771e32575873bba48b16b6ef1696b63087a2a`                                          | `173867dce0580ea751e4b9c558740d34f20ce549`                                           |
| Licence file SHA-256           | `778186245840aea0e60bec6a46e7fb1442e0cd78e41afeadffcd3e8824b379e0`                  | `1781d2806a07d91c4edf4740b88449fab7d0eadad53f7c351b94cd4d4eb8c00f`                   |
| Licence file git blob SHA      | `ebe73cf731875468cbc35c1d8857ac037328918f`                                          | `61f6f4b7853081236aec6407f2dd3c7170997f84`                                           |
| Copyright                      | 2020 The Geologisk Project Authors                                                  | 2024 The Geist Project Authors                                                       |

## How the files were made

Run once, by hand, outside the repository (Python 3.13, `fonttools==4.66.1`, `brotli==1.2.0` in a throwaway
virtual environment). Download the sources from the pinned commits and check the SHA-256 values above first.

```bash
RAW=https://raw.githubusercontent.com/google/fonts
curl -sLo geologica.ttf "$RAW/1df853d271883511f51912529ec580044d412d39/ofl/geologica/Geologica%5BCRSV%2CSHRP%2Cslnt%2Cwght%5D.ttf"
curl -sLo geistmono.ttf "$RAW/9e25e2ba265e5298f70f6182dd4e8a3ebf1b9123/ofl/geistmono/GeistMono%5Bwght%5D.ttf"

LAT="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0131,U+2010-2015,U+2018-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2212"
CYR="U+0301,U+0400-045F,U+0490-0491,U+2116"
GEO_FEAT="kern,liga,calt,ccmp,locl,case,tnum,pnum,ss01,mark,mkmk,rvrn"
fonttools varLib.instancer geologica.ttf CRSV=0 slnt=0 -o geologica-2axes.ttf   # keep wght and SHRP only
pyftsubset geologica-2axes.ttf --unicodes="$LAT" --layout-features="$GEO_FEAT" --flavor=woff2 --no-hinting --desubroutinize --output-file=geologica-latin.woff2
pyftsubset geologica-2axes.ttf --unicodes="$CYR" --layout-features="$GEO_FEAT" --flavor=woff2 --no-hinting --desubroutinize --output-file=geologica-cyrillic.woff2
pyftsubset geistmono.ttf --unicodes="$LAT" --layout-features="ccmp,locl,case,mark,mkmk" --flavor=woff2 --no-hinting --desubroutinize --output-file=geist-mono-latin.woff2
```

## Verified from the shipped files (fonttools, cmap and fvar)

- Missing from the German set `ä ö ü Ä Ö Ü ß „ “ ” ‚ ‘ ’ – — … € •`: none, in both Latin files.
- Missing from the Ukrainian set `ї є ґ Ї Є Ґ і`: none, in the Cyrillic file.
- Geologica axes kept: `wght` 100-900, `SHRP` 0-100 (`CRSV` and `slnt` removed). Geist Mono: `wght` 100-900.
- Latin Extended-A glyphs present: Geologica 126 of 128, Geist Mono 115 of 128. Tabular figures (`tnum`) present in Geologica Latin.

## Shipped files (SHA-256, two spaces, then the file name; a test compares these lines)

```
3f18d35ece303657a0b7f65426354366bb1affac70b1bce4c15fbc5ec0d9a7a5  geologica-latin.woff2
9d4c027326991b42bc13536fadee0b9ad0da5a78a5e32446ba6122581e6a506f  geologica-cyrillic.woff2
7f4af58ef57a7fedaf2dd7d67ee5a27903d42f3022c0855b479be4b36495a8b0  geist-mono-latin.woff2
```

Sizes in bytes: `geologica-latin.woff2` 32776, `geist-mono-latin.woff2` 22428, `geologica-cyrillic.woff2` 18508.
