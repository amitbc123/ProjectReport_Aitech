# CLAUDE.md

## Architecture: multi-file, no bundler, no build step

This site used to be a single `index.html` with everything inlined. It was
refactored into plain ES modules — `js/report/*.js`, `js/export/*.js`,
`js/router.js`, plus `css/base.css` and `css/export-plan.css` — loaded
directly by the browser with no bundler, no build step, and no dev server
required. `index.html`'s `<script type="module">` tags are just the entry
points; each module then pulls in the rest of its own graph via relative
`import ... from './x.js'` statements.

**Consequence for every future change:** a change is no longer "edit one
file." If you touch behavior that spans the KPI band, the filter bar, or
anything shared between Project Report and Export Plan, check both
`js/report/` and `js/export/` (they're parallel, independently-maintained
implementations of the same UI patterns — see `.mfbar`/`.fpanel` collapse
markup reused by both the Filters bar and the KPI "Status" band). Grep for
the thing you're changing across the whole `js/` tree before assuming one
file is the only place it lives.

## Cache-busting: every file reference needs its own `?v=` token

The site deploys to GitHub Pages, which (like most browsers) caches static
assets aggressively. Because there's no bundler, **every** JS/CSS file is
fetched at its own literal URL, and — this is the part that broke once
already — **an ES module import does NOT inherit the query string of the
file that imported it**. `<script type="module" src="js/report/main.js?v=X">`
being fresh does nothing for `js/report/file-intake.js`, which `main.js`
imports via a bare `from './file-intake.js'` with no query string of its
own. Each file in the whole import graph carries its own `?v=<token>`,
independently, in:

- `index.html` — every `<link rel=stylesheet>` and `<script src=...>` tag
- every relative `from './x.js'` / `import './x.js'` inside `js/**/*.js`

**Whenever you edit any `.css` or `.js` file, before committing, run:**

```
python3 scripts/bump_cache_version.py
```

(or pass an explicit token: `python3 scripts/bump_cache_version.py 20260901a`).
It rewrites every existing `?v=...` occurrence across `index.html` and the
whole `js/` tree to the new token in one pass — that's the whole point of
having it as a script instead of a rule to remember: a change spread across
24+ files is exactly the kind of edit that's easy to do 23-out-of-24 times
and never notice the miss. If you add a brand-new `.js` file with its own
relative imports, write those imports with the *current* token already on
them (check `index.html` for the current value) so the next bump picks them
up correctly.

Skipping this after a real change produces a very specific, confusing bug:
the deployed `index.html` is fresh (so new markup/buttons are visible) while
some deployed `.js`/`.css` file is still an old cached version (so the new
markup's behavior/styling silently doesn't work) — it looks like a logic
bug in the new code, but reproduces in every fresh automated test locally
and is actually a stale-asset problem that only shows up on the real
deployed site. If a user reports "the button is there but does nothing" (or
"looks unstyled") right after a change shipped, check this before
re-debugging the logic.
