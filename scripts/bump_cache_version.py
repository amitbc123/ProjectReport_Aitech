#!/usr/bin/env python3
"""Bump the ?v=... cache-busting token across the whole site in one shot.

This is a plain multi-file static site with NO bundler: every JS module is
fetched by the browser at its own literal URL (index.html's <script>/<link>
tags, and every relative `from './x.js'` import inside js/**/*.js). Browsers
and GitHub Pages' CDN cache each of those URLs independently, and an ES
module import does NOT inherit the query string of the file that imported
it. So a version bump has to touch every one of those references, or some
files stay stale after a deploy while others update — which is exactly what
happened once already (see CLAUDE.md).

Run this any time you change ANY .css or .js file, before committing:

    python3 scripts/bump_cache_version.py            # bumps to today's date
    python3 scripts/bump_cache_version.py 20260901a   # or pass an explicit token

It rewrites every existing ?v=<token> occurrence (in index.html and every
js/**/*.js import) to the new token, so it's safe to re-run repeatedly.
"""
import re
import sys
import pathlib
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
OLD_TOKEN_RE = re.compile(r"(\?v=)([A-Za-z0-9]+)")


def main():
    new_token = sys.argv[1] if len(sys.argv) > 1 else date.today().strftime("%Y%m%d")

    targets = [ROOT / "index.html"] + sorted((ROOT / "js").rglob("*.js"))
    changed = []
    for f in targets:
        text = f.read_text()
        new_text = OLD_TOKEN_RE.sub(lambda m: m.group(1) + new_token, text)
        if new_text != text:
            f.write_text(new_text)
            changed.append(f.relative_to(ROOT))

    if not changed:
        print("No ?v=... references found — nothing to bump.")
        return
    print(f"Bumped {len(changed)} file(s) to ?v={new_token}:")
    for c in changed:
        print(f"  {c}")


if __name__ == "__main__":
    main()
