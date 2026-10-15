"use strict";
/* Core helpers shared by every module. */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
// shortest signed difference between two angles
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turnTo = (a, b, max) => { const d = angDiff(a, b); return a + clamp(d, -max, max); };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Seeded RNG (mulberry32) so maps decorate the same way on every device (online play shares a seed).
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Hash two ints into 0..1 (deterministic texture noise).
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const r = a.map((v, i) => Math.round(lerp(v, b[i], t)));
  return "#" + r.map((v) => v.toString(16).padStart(2, "0")).join("");
}
function shade(hex, amt) { return amt < 0 ? mix(hex, "#000000", -amt) : mix(hex, "#ffffff", amt); }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

/* Style: "standard" (no blood: hits kick up dust, zombies crumble to ash) or "gritty" (blood, gore, bodies stay a while).
   Chosen in Settings, stored in save.settings.tone. It only changes how things LOOK on this device, never the rules,
   so two players online can each use their own. Standard is the default (friends may play). */
let TONE = "standard";
function setTone(t) {
  TONE = t === "gritty" ? "gritty" : "standard";
  if (document.body) document.body.classList.toggle("gritty", TONE === "gritty");
}
const GRITTY = () => TONE === "gritty";

const IS_TOUCH = "ontouchstart" in window || navigator.maxTouchPoints > 0;
const now = () => performance.now() / 1000;
const STEP = 1 / 60;            // fixed simulation step
const TILE = 40;                // world units per map tile
