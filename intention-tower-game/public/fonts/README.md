# Bundled UI font

`NotoSansSC-VF.ttf` is the official Noto Sans SC variable TrueType font,
distributed by Google Fonts. It is bundled locally so Chinese UI and SVG
labels render on Linux, Windows, and macOS without an installed CJK font or
access to Google's CDN.

- Font source: https://github.com/google/fonts/blob/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf
- License source: https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt
- Upstream filename: `NotoSansSC[wght].ttf`
- Distribution license: SIL Open Font License 1.1. The complete upstream
  copyright notice and license are preserved in `OFL.txt` beside the font.

The font binary is not modified. `Intention CJK` is only the application’s
CSS family alias, not a renamed or modified font product. The CSS declares
the upstream variable weight range 100–900 and retains English system-font
fallbacks. Browser verification explicitly loads and checks this alias to
avoid mistaking an OS-installed font for the bundled asset.
