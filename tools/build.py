#!/usr/bin/env python3
"""Build Last Stand: inline src/*.css + src/*.js into index.html and stamp sw.js.

Usage:  python3 tools/build.py
Edit files in src/, then run this. Commit src/ together with the built index.html, sw.js and version.json.
"""
import hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

JS_ORDER = ["core.js", "data.js", "maps.js", "world.js", "art.js", "audio.js", "game.js", "zombies.js",
            "tdm.js", "ai.js", "render.js", "hud.js", "input.js", "net.js", "ui.js", "update.js", "main.js"]

ASSETS = ["index.html", "manifest.webmanifest", "peerjs.min.js",
          "fonts/blackops.woff2", "fonts/chakra-500.woff2", "fonts/chakra-700.woff2",
          "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
          "icons/icon-maskable-512.png", "icons/favicon-64.png"]


def main():
    shell = (SRC / "shell.html").read_text()
    css = (SRC / "style.css").read_text()
    js = "\n".join(f"// ===== {n} =====\n" + (SRC / n).read_text() for n in JS_ORDER)
    html = shell.replace("/*@CSS*/", css).replace("/*@JS*/", js)
    # Build id = hash of the page (before stamping) + every other asset. It names the cache, is stamped into the
    # page as BUILD_ID, and is written to version.json, which the game checks on open to offer the UPDATE banner.
    h = hashlib.sha256(html.encode())
    for a in ASSETS[1:]:
        p = ROOT / a
        if p.exists():
            h.update(p.read_bytes())
    cache = "last-stand-" + h.hexdigest()[:10]
    html = html.replace("__BUILD__", cache)
    (ROOT / "index.html").write_text(html)
    (ROOT / "version.json").write_text('{"build": "%s"}\n' % cache)
    sw = (SRC / "sw.template.js").read_text()
    sw = sw.replace("__CACHE__", cache).replace("__ASSETS__", ",\n  ".join(
        repr("./" if a == "index.html" else "./" + a) for a in ASSETS))
    (ROOT / "sw.js").write_text(sw)
    print(f"built index.html ({len(html)//1024} KB), sw cache {cache}")


if __name__ == "__main__":
    main()
