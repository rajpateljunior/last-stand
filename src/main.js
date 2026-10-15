/* Boot, main loop, resize, PWA glue. */

const canvas = $("#game");
const ctx = canvas.getContext("2d", { alpha: false });
let CW = 0, CH = 0, DPR = 1, autoCap = 2;
const perf = { acc: 0, n: 0 };
let SAFE = { l: 0, r: 0, t: 0, b: 0 };
let SAFE_PROBE = null;
function readSafe() {
  if (!SAFE_PROBE) {
    SAFE_PROBE = document.createElement("div");
    SAFE_PROBE.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;box-sizing:content-box;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none";
    document.body.appendChild(SAFE_PROBE);
  }
  const cs = getComputedStyle(SAFE_PROBE);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function viewSize() {
  const r = canvas.getBoundingClientRect();
  if (r.width > 50 && r.height > 50) return [Math.round(r.width), Math.round(r.height)];
  return [window.innerWidth, window.innerHeight];
}
let viewKey = "";
function resize(force) {
  const s = readSafe();
  const [w, h] = viewSize();
  const g = App.save ? App.save.settings.gfx : "auto";
  const cap = g === "smooth" ? 1.25 : g === "sharp" ? 3 : autoCap;
  const dpr = Math.min(window.devicePixelRatio || 1, cap);
  const n = App.match ? Input.n : 1;
  const key = [w, h, s.t, s.r, s.b, s.l, dpr, n].join("|");
  if (key === viewKey && !force) return;
  viewKey = key;
  SAFE = s; CW = w; CH = h; DPR = dpr;
  const bw = Math.round(CW * DPR), bh = Math.round(CH * DPR);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  Input.layout = computeLayout(CW, CH, IS_TOUCH && App.match ? Math.max(1, Input.n) : 1, SAFE);
  // keep views sized to the screen
  const fit = (views) => {
    if (!views) return;
    if (views.length === 2) { views[0].w = CW / 2; views[0].h = CH; views[1].x0 = CW / 2; views[1].w = CW / 2; views[1].h = CH; }
    else if (views[0]) { views[0].w = CW; views[0].h = CH; }
  };
  fit(App.views); fit(App.demoViews);
}
let settleTimers = [];
function settleViewport() { settleTimers.forEach(clearTimeout); settleTimers = [0, 80, 250, 500, 900, 1600, 3000].map((ms) => setTimeout(resize, ms)); }

function consumeEvents(G, views, silent) {
  const evs = G.vev; G.vev = [];
  for (const e of evs) {
    if (silent && (e.k === "snd" || e.k === "boom" || e.k === "round")) { if (e.k === "boom") { R.booms.push({ x: e.x, y: e.y, r: e.r, t: 0.35, max: 0.35 }); decalScorch(R, e.x, e.y, e.r * 0.5); } continue; }
    fxEvent(G, e, views);
  }
  return evs;
}

function frame(tms) {
  requestAnimationFrame(frame);
  const t = tms / 1000;
  let dt = App.lastT ? t - App.lastT : STEP;
  App.lastT = t;
  dt = Math.min(dt, 0.1);
  App.chkT = (App.chkT || 0) + dt;
  if (App.chkT > 0.25) { App.chkT = 0; resize(); }
  perf.acc += dt; perf.n++;
  if (perf.acc > 2) {
    const avg = perf.acc / perf.n;
    if (App.save.settings.gfx === "auto") {
      if (avg > 1 / 45 && autoCap > 1) { autoCap = Math.max(1, autoCap - 0.25); resize(true); }
      else if (avg < 1 / 58 && autoCap < 2) { autoCap = Math.min(2, autoCap + 0.25); resize(true); }
    }
    perf.acc = 0; perf.n = 0;
  }
  const G = App.match;
  if (G) {
    const locals = Input.me || [];
    const guest = G.net && G.net.role === "guest", host = G.net && G.net.role === "host";
    if (!App.paused && !G.hold) {
      App.acc = (App.acc || 0) + dt * (G.over ? 0.35 : 1);
      let n = 0;
      while (App.acc >= STEP && n < 5) {
        const inputs = [];
        for (const me of locals) inputs[me.pidx] = readPlayer(me.pidx, G, me);
        if (guest) { netGuestEdges(inputs[0] || {}); guestStep(G, inputs[0] || {}, STEP); }
        else { stepMatch(G, inputs, STEP); runSimTimers(G); if (host) netHostConsume(G); }
        for (const me of locals) consumeEdges(me.pidx);
        App.acc -= STEP; n++;
      }
      if (n >= 5) App.acc = 0;
    }
    SFX.setListeners(locals.filter((p) => p).map((p) => ({ x: p.x, y: p.y })));
    const evs = consumeEvents(G, App.views);
    if (host) netHostFrame(G, dt, evs);
    if (guest) netGuestFrame(G, dt);
    renderGame(ctx, G, App.views, t, dt);
    drawControls(ctx, G, App.views);
    if (G.over) {
      App.overT = (App.overT || 0) + dt;
      if (App.overT > 3.2) endMatch(false);
    }
    return;
  }
  // title / menus: the demo plays behind
  const D = App.demo;
  if (D && App.demoViews) {
    stepMatch(D, [], Math.min(dt, 1 / 30));
    runSimTimers(D);
    if (D.z.round > 7 || D.over) { startDemo(); return; }
    SFX.setListeners([{ x: -99999, y: -99999 }]);
    consumeEvents(D, App.demoViews, true);
    renderGame(ctx, D, App.demoViews, t, dt);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#070807"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function setupPWA() {
  setupUpdates();
  if (location.search.indexOf("u=") >= 0) try { history.replaceState(null, "", location.pathname); } catch (_) {}
  const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let dismissed = false;
  try { dismissed = localStorage.getItem("ls-install-dismissed") === "1"; } catch (_) {}
  const box = $("#install");
  const close = () => { box.classList.add("hidden"); try { localStorage.setItem("ls-install-dismissed", "1"); } catch (_) {} };
  if (ios && !standalone && !dismissed) {
    box.innerHTML = `<span>Install: tap <b>Share</b> <span style="font-size:16px">⬆︎</span> then <b>Add to Home Screen</b> for full-screen play.</span><button>OK</button>`;
    box.classList.remove("hidden");
    box.querySelector("button").onclick = close;
    setTimeout(close, 12000);
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); if (dismissed) return;
    box.innerHTML = `<span>Install Last Stand as an app?</span><button data-i>INSTALL</button><button data-x>✕</button>`;
    box.classList.remove("hidden");
    box.querySelector("[data-i]").onclick = () => { e.prompt(); close(); };
    box.querySelector("[data-x]").onclick = close;
  });
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}
  $("#upd button").onclick = applyUpdate;
}

async function boot() {
  App.save = loadSave();
  saveGame();
  setTone(App.save.settings.tone);
  resize(true);
  window.addEventListener("resize", settleViewport);
  window.addEventListener("orientationchange", settleViewport);
  window.addEventListener("pageshow", settleViewport);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", settleViewport);
  if (window.screen && screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", settleViewport);
  initInput(canvas);
  wireMenus();
  SFX.setMusic(App.save.settings.music); SFX.setSfx(App.save.settings.sfx);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (App.match && !App.paused && !App.match.net) pauseMatch(); SFX.suspend(); }
    else { SFX.resume(); settleViewport(); }
  });
  const firstTouch = () => {
    SFX.unlock();
    if (!App.match) SFX.music("menu");
    window.removeEventListener("pointerdown", firstTouch); window.removeEventListener("keydown", firstTouch);
  };
  window.addEventListener("pointerdown", firstTouch); window.addEventListener("keydown", firstTouch);
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  let lastTap = 0;
  document.addEventListener("touchend", (e) => {
    const n = Date.now();
    const interactive = e.target.closest && e.target.closest("button, .mapcard, .acard, input, textarea, .seg, canvas");
    if (!interactive && n - lastTap < 300) e.preventDefault();
    lastTap = n;
  }, { passive: false });
  try { await Promise.all([document.fonts.load("30px 'Black Ops One'"), document.fonts.load("600 14px 'Chakra Petch'")]); } catch (_) {}
  renderTitle();
  setupPWA();
  startDemo();
  requestAnimationFrame(frame);
  setTimeout(() => { if (whatsNewDue()) openWhatsNew(); }, 700);
}
boot();
