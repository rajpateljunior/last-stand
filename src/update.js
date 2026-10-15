/* Updates + backups (same system as Wild Riders).
   1) UPDATE BANNER: on open (and when the app comes back to the front) the game reads version.json from the internet.
      If it names a different build than this page's BUILD_ID, a banner says "New update available" with an UPDATE
      button (menus only, never during a match). UPDATE clears the app's cached files and reloads from the internet.
      Progress is never touched (it lives in localStorage, not in the app cache). Never delete the Home Screen app.
   2) WHAT'S NEW: after an update, a popup lists the changes (APP_VERSION / WHATS_NEW below; edit them on every release).
   3) BACKUP REMINDER: after a few matches (at most every 3 days) a popup shows the save code with COPY / SHARE. */

// ===== Edit these two on every release =====
const APP_VERSION = "2026.10.15";
const WHATS_NEW = [
  "<b>Last Stand is here.</b> Zombies (endless rounds) and Team Deathmatch (4 vs 4).",
  "Three maps: <b>Outpost</b> (night, rain), <b>Downtown</b> (dusk), <b>Farmhouse</b> (fog).",
];
// ============================================

const BUILD_ID = "__BUILD__";            // stamped by tools/build.py; matches version.json of this build
const VERSION_KEY = "ls-version", BACKUP_INFO_KEY = "ls-backup";
const Upd = { ready: false };

function setupUpdates() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  const check = () => {
    if (Upd.ready || !navigator.onLine) return;
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && j.build && j.build !== BUILD_ID) markUpdateReady();
    }).catch(() => {});
  };
  setTimeout(check, 1500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.addEventListener("online", check);
  setInterval(check, 30 * 60 * 1000);
}
function markUpdateReady() { Upd.ready = true; refreshUpdateBanner(); }
function refreshUpdateBanner() {
  const b = document.querySelector("#upd");
  if (!b) return;
  const onMenu = typeof App !== "undefined" && !App.match && document.querySelector("#loading").classList.contains("hidden");
  b.classList.toggle("hidden", !(Upd.ready && onMenu));
}
setInterval(() => { if (typeof App !== "undefined" && App.save) refreshUpdateBanner(); }, 800);

async function applyUpdate() {
  const b = document.querySelector("#upd button");
  if (b) { b.disabled = true; b.textContent = "UPDATING…"; }
  try { saveGame(); } catch (_) {}
  try {
    if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
    if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.filter((k) => k.startsWith("last-stand-")).map((k) => caches.delete(k))); }
  } catch (_) {}
  location.replace(location.pathname + "?u=" + Date.now());
}

function whatsNewDue() {
  let seen = null; try { seen = localStorage.getItem(VERSION_KEY); } catch (_) {}
  if (seen === APP_VERSION) return false;
  if (!seen && !(App.save && App.save.stats.matches > 0)) { try { localStorage.setItem(VERSION_KEY, APP_VERSION); } catch (_) {} return false; }
  return true;
}
function openWhatsNew(after) {
  modal(`<h3>WHAT'S NEW</h3><ul class="wn">${WHATS_NEW.map((l) => `<li>${l}</li>`).join("")}</ul>
    <div class="wnfoot"><span>Version ${APP_VERSION} · your progress was kept</span><button class="btn sm" data-a="ok">LET'S GO</button></div>`, (box) => {
    box.classList.add("wnbox");
    box.querySelector('[data-a="ok"]').onclick = () => { SFX.play("click"); try { localStorage.setItem(VERSION_KEY, APP_VERSION); } catch (_) {} closeModal(); after && after(); };
  });
}

function backupInfo() { try { return JSON.parse(localStorage.getItem(BACKUP_INFO_KEY) || "null") || { at: 0, m: 0 }; } catch (_) { return { at: 0, m: 0 }; } }
function backupDue() {
  const s = App.save; if (!s || s.stats.matches < 3) return false;
  const b = backupInfo();
  if (!b.at) return true;
  return s.stats.matches - b.m >= 5 && Date.now() - b.at >= 3 * 864e5;
}
function openBackupReminder(after) {
  const code = encodeSave();
  const r = rankOf(App.save.xp);
  modal(`<h3>BACK UP YOUR PROGRESS</h3>
    <p>Keep a copy of this code somewhere safe, like your Notes app or a text to yourself. If your progress is ever lost (new phone, cleared data), paste it into <b>Settings → Save Code</b> and everything comes back.</p>
    <p style="color:var(--gold);font-weight:700">Rank ${r} · ${App.save.xp.toLocaleString()} XP</p>
    <textarea readonly id="bk-code">${code}</textarea>
    <div class="acts">
      <button class="btn sm" data-a="copy">COPY CODE</button>
      ${navigator.share ? `<button class="btn sm ghost" data-a="share">SHARE / SAVE…</button>` : ""}
      <button class="btn sm ghost" data-a="done">DONE</button>
    </div>`, (box) => {
    box.classList.add("wide");
    const mark = () => { try { localStorage.setItem(BACKUP_INFO_KEY, JSON.stringify({ at: Date.now(), m: App.save.stats.matches })); } catch (_) {} };
    box.querySelector('[data-a="copy"]').onclick = () => {
      const t = box.querySelector("#bk-code"); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast("COPIED! PASTE IT IN NOTES")).catch(() => { try { document.execCommand("copy"); toast("COPIED!"); } catch (_) {} });
      mark();
    };
    const sh = box.querySelector('[data-a="share"]');
    if (sh) sh.onclick = () => { navigator.share({ title: "Last Stand save code", text: code }).then(mark).catch(() => {}); };
    box.querySelector('[data-a="done"]').onclick = () => { SFX.play("click"); mark(); closeModal(); after && after(); };
  });
}
function maybeBackupReminder() {
  if (!backupDue() || !document.querySelector("#modal").classList.contains("hidden")) return;
  openBackupReminder();
}
