# Development

How to preview, rebuild, and deploy this site.

```
index.html      landing page (intro prose + links)
resume.html     experience, skills, education
styles.css      all styling, shared by both pages
resume.pdf      built from resume-src/ (see below)
robots.txt      indexable, except the PDF
CNAME           custom domain for GitHub Pages
```

## Preview locally

There is nothing to install and nothing to build. From the repo root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://localhost:8000>. `Ctrl-C` to stop.

`--bind 127.0.0.1` keeps it on the loopback interface. Without it,
`http.server` listens on `0.0.0.0` and serves the directory to everyone on
your network.

To run it in the background instead:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 &   # start
pkill -f "http.server 8000"                      # stop
```

Any static server works — this one is just already on every Mac.

## Rebuild the PDF

`resume.pdf` is generated from `resume-src/resume-web.tex`, a variant of the
full resume with contact details reduced to LinkedIn only. Requires a TeX
distribution (MacTeX).

```bash
cd resume-src
latexmk -pdf -outdir=/tmp/resume resume-web.tex
cp /tmp/resume/resume-web.pdf ../resume.pdf
```

Building to `/tmp` keeps the `.aux` / `.log` / `.fls` clutter out of the repo.

## Check it renders

Screenshot both breakpoints without opening a browser:

```bash
FF="/Applications/Firefox.app/Contents/MacOS/firefox"
"$FF" --headless --screenshot /tmp/desktop.png --window-size=1280,1600 http://localhost:8000/
"$FF" --headless --screenshot /tmp/mobile.png  --window-size=390,1400  http://localhost:8000/
```

`Cmd-P` in a real browser previews the print stylesheet, which strips the
terminal styling down to a clean black-on-white resume.

## Rebuild the link-preview card

`og.png` is the image shown when the site is shared in Slack, iMessage,
LinkedIn, etc. It is generated from `og-src/card.html` — edit that, then
re-render at exactly 1200x630:

```bash
FF="/Applications/Firefox.app/Contents/MacOS/firefox"
"$FF" --headless --screenshot "$PWD/og.png" --window-size=1200,630 \
  "file://$PWD/og-src/card.html"
```

Keep the card's palette in sync with `styles.css` if the colours change.
Unfurlers cache aggressively: after updating the image, add a query string
(`?v=2`) to force a fresh fetch when testing, and use LinkedIn's Post
Inspector to refresh its copy.

## Regenerate the favicon

`favicon.svg` is the source of truth; `favicon.ico` and
`apple-touch-icon.png` are derived from it. After editing the SVG:

```bash
for s in 16 32 48; do rsvg-convert -w $s -h $s favicon.svg -o /tmp/fav$s.png; done
rsvg-convert -w 180 -h 180 favicon.svg -o apple-touch-icon.png
python3 - <<'EOF'
import struct, pathlib
imgs = [(s, pathlib.Path(f"/tmp/fav{s}.png").read_bytes()) for s in (16, 32, 48)]
out = struct.pack("<HHH", 0, 1, len(imgs))
off = 6 + 16 * len(imgs)
entries = blobs = b""
for s, d in imgs:
    entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(d), off)
    blobs += d; off += len(d)
pathlib.Path("favicon.ico").write_bytes(out + entries + blobs)
EOF
```

Needs `rsvg-convert` (`brew install librsvg`). Browsers cache favicons
aggressively and ignore a hard refresh, so bump the `?v=` on the
`favicon.svg` link in all four pages when the icon changes — that is what
actually forces the update.

## Deploy

GitHub Pages serves griffingarland.com from `main`:

```bash
git push
```

That's the whole deploy. Pages rebuilds automatically; changes are live in
a minute or two.

## Notes

- The footer is byte-identical on every page and uses root-relative links
  (`/resume.html`, not `resume.html`), which is what lets the same markup
  work from `/` and from `/games/`. If you edit it, edit all four copies.
  This assumes the site is served from a domain root — it is, on
  griffingarland.com and under `python3 -m http.server` from the repo root.

- Both pages are indexable. `robots.txt` disallows `resume.pdf` only — it's
  meant to be reached from a link, not found in search.
- The DNS records are two CNAMEs at Cloudflare (`@` and `www`, both pointing
  at `griffingarland.github.io`), set to **DNS only**. Enabling Cloudflare's
  proxy breaks GitHub's certificate renewal.
- No webfonts: the site uses whatever monospace font the visitor's system
  has, which is both faster and more authentically terminal-looking.
