# Personal Portfolio Website

A resume/portfolio site to showcase skills. Owner is a backend engineer with
minimal front-end experience — favor explaining the front-end choices, and
don't assume CSS fluency.

## Decisions already made

**Stack: plain HTML + CSS + minimal vanilla JS. No framework, no build step.**
Chosen because the top constraint is *low maintenance* — no `node_modules` to
rot, no security advisories, no build that breaks on a Node bump. It also
happens to be the fastest option (no bundle, no hydration) and the easiest to
learn from. If a multi-post blog is ever added, Astro is the upgrade path and
the CSS ports over unchanged. Do not introduce React/Next/Tailwind/a bundler
without asking.

**Theme: terminal *aesthetic* only.**
Monospace type, prompt-style section headers (`$ cat experience.md`), dark
palette, optional CRT/scanline touches. It is a normal scrolling page.
Explicitly NOT an interactive shell — no command input, no `ls`/`cat` the
visitor types, nothing hidden behind commands. This was considered and
rejected: recruiters won't type, mobile has no keyboard, and it hurts SEO and
screen readers.

**Goals, in priority order:** fast, low cost, simple, low upkeep.
Must work well on mobile and be readable by crawlers/screen readers.

## Structure

Two pages, sharing `styles.css`:
- `index.html` — landing page. Intro prose (the ABOUT block is the owner's to
  write; don't rewrite it unasked) plus an `ls`-style link listing.
- `resume.html` — skills, experience, education.
- `resume.pdf` — built from `resume-src/resume-web.tex` via
  `latexmk -pdf`. LinkedIn-only contact; no phone or email anywhere.

Search: both pages are indexable; `robots.txt` disallows `resume.pdf` only.

## Still open

- **Hosting.** Recommendation on the table: Cloudflare Pages (free, unlimited
  bandwidth, git-push deploys, free HTTPS). Alternative: GitHub Pages.
- **Domain.** Recommendation: Cloudflare Registrar — sells at wholesale with no
  markup (~$11/yr for a .com) vs ~$20+/yr elsewhere after teaser rates lapse.
  Requires DNS on Cloudflare, which Pages needs anyway.
- Resume content, project list, and whether the resume is also linked as a PDF.

## Repo gotcha

`git rev-parse --show-toplevel` from this directory returns
`/Users/griffingarland/src` — the *parent* is an accidental git repo covering
every project in `~/src`, which is why unrelated dirs (`rust1/`, `resume/`,
`webservice/`, ...) show as untracked. Before the first commit here:
run `git init` in this directory, and separately decide whether to
`rm -rf /Users/griffingarland/src/.git`.

## Local dev

No toolchain needed. `python3 -m http.server 8000` and open localhost:8000.
