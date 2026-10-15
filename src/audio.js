/* Synthesized audio: layered gunshots with echo, explosions, zombies, UI stingers, ambience and music. No audio files.
   iPhone note: the ring/silent switch mutes web audio, and iOS only starts sound after the first tap. */

const SFX = (() => {
  let ac = null, master, music, sfx, wet, comp, noiseBuf, ambNode = null, ambGain = null, seq = null, heart = 0;
  let musicOn = true, sfxOn = true;
  const MUSIC_VOL = 0.32, SFX_VOL = 0.85;
  let unlocked = false, listeners = [{ x: 0, y: 0 }];
  const recent = {};

  function init() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9;
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(master); master.connect(ac.destination);
    music = ac.createGain(); music.gain.value = musicOn ? MUSIC_VOL : 0; music.connect(comp);
    sfx = ac.createGain(); sfx.gain.value = sfxOn ? SFX_VOL : 0; sfx.connect(comp);
    // reverb: generated impulse (outdoor slap + tail)
    const conv = ac.createConvolver();
    const len = ac.sampleRate * 1.7, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / ac.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (t > 0.06 && t < 0.09 ? 2.2 : 1); } }
    conv.buffer = ir;
    wet = ac.createGain(); wet.gain.value = 0.32; wet.connect(conv); conv.connect(sfx);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function unlock() {
    init(); if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    if (!unlocked) { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); unlocked = true; }
  }
  const T = () => ac.currentTime;

  // where a sound is relative to the nearest local player → [volume, pan, muffle 0..1]
  function spatial(x, y) {
    if (x === undefined) return [1, 0, 0];
    let best = 1e9, dx = 0;
    for (const l of listeners) { const d = Math.hypot(x - l.x, y - l.y); if (d < best) { best = d; dx = x - l.x; } }
    const v = 1 / (1 + best / 380);
    return [best > 2400 ? 0 : v, clamp(dx / 700, -0.85, 0.85), clamp(best / 1400, 0, 0.9)];
  }
  function out(pan, muffle, toWet = 0) {
    let node = sfx;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = pan; p.connect(sfx); node = p; }
    if (muffle > 0.05) { const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9000 * (1 - muffle) + 400; lp.connect(node); node = lp; }
    if (toWet > 0) { const g = ac.createGain(); g.gain.value = toWet; g.connect(wet); const split = ac.createGain(); split.connect(node); split.connect(g); return split; }
    return node;
  }
  function tone(f, dur, type, vol, dst, when = 0, slide = 0, att = 0.004) {
    const t = T() + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(dur, vol, f, q, type, dst, when = 0, fSlide = 0, att = 0.002) {
    const t = T() + when, s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (fSlide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f * fSlide), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dst); s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
  }

  const GUN = {
    pistol: [3200, 0.045, 0.5, 1500, 0.13, 0.65, 115, 0.08, 0.5, 0.3],
    magnum: [2600, 0.06, 0.7, 900, 0.3, 0.95, 70, 0.18, 0.9, 0.55],
    smg: [3800, 0.03, 0.42, 1700, 0.09, 0.5, 125, 0.06, 0.35, 0.22],
    rifle: [3000, 0.04, 0.55, 1250, 0.14, 0.72, 92, 0.1, 0.6, 0.35],
    ak: [2400, 0.05, 0.6, 900, 0.18, 0.82, 80, 0.12, 0.7, 0.4],
    shotgun: [1800, 0.06, 0.6, 620, 0.36, 1.0, 58, 0.22, 1.0, 0.6],
    dmr: [3500, 0.05, 0.7, 1100, 0.22, 0.82, 75, 0.14, 0.8, 0.55],
    lmg: [2600, 0.05, 0.6, 1000, 0.16, 0.82, 70, 0.12, 0.8, 0.4],
    sniper: [4300, 0.07, 0.9, 900, 0.42, 1.0, 54, 0.24, 1.0, 0.9],
  };
  function gunshot(cls, v, pan, muf, up) {
    if (cls === "launcher") { const d = out(pan, muf, 0.3); tone(130, 0.28, "sine", 0.9 * v, d, 0, 0.35); noise(0.3, 0.6 * v, 500, 0.7, "lowpass", d); return; }
    if (cls === "volt") { const d = out(pan, muf, 0.2); noise(0.35, 0.5 * v, 2500, 2, "bandpass", d, 0, 0.3); tone(880, 0.3, "sawtooth", 0.18 * v, d, 0, 0.3); tone(1760, 0.2, "square", 0.08 * v, d, 0.02, 0.5); return; }
    const p = GUN[cls] || GUN.rifle;
    const d = out(pan, muf, p[9] * (0.6 + muf));
    const pitch = rnd(0.94, 1.06);
    noise(p[1], p[2] * v, p[0] * pitch, 0.8, "highpass", d);
    noise(p[4], p[5] * v, p[3] * pitch, 0.7, "lowpass", d, 0.002, 0.5);
    tone(p[6] * pitch, p[7], "sine", p[8] * v, d, 0, 0.45);
    if (up) tone(220 * pitch, 0.12, "sawtooth", 0.12 * v, d, 0, 2.2);
  }

  const sounds = {
    reload: (o, d) => { noise(0.05, 0.25, 2500, 3, "bandpass", d, 0.05); noise(0.05, 0.3, 1800, 3, "bandpass", d, 0.45); noise(0.06, 0.35, 1200, 2, "bandpass", d, 0.8); },
    reloadEnd: (o, d) => noise(0.05, 0.35, 900, 2, "bandpass", d),
    dry: (o, d) => noise(0.03, 0.3, 3000, 4, "bandpass", d),
    swap: (o, d) => { noise(0.12, 0.15, 900, 1, "bandpass", d); noise(0.04, 0.25, 2200, 3, "bandpass", d, 0.15); },
    knife: (o, d) => noise(0.14, 0.35, 3000, 2, "bandpass", d, 0, 0.3),
    stab: (o, d) => { tone(140, 0.1, "sine", 0.5, d, 0, 0.5); noise(0.08, 0.4, 600, 1, "lowpass", d); },
    throw: (o, d) => noise(0.18, 0.2, 800, 1.5, "bandpass", d, 0, 3),
    clink: (o, d) => tone(2400 + Math.random() * 600, 0.08, "triangle", 0.15, d),
    boom: (o, d) => { noise(1.4, 1.0, 380, 0.6, "lowpass", d, 0, 0.25); tone(48, 0.7, "sine", 1.0, d, 0, 0.6); noise(0.2, 0.6, 1600, 0.5, "bandpass", d); },
    pop: (o, d) => { noise(0.25, 0.6, 700, 0.6, "lowpass", d); tone(90, 0.18, "sine", 0.6, d, 0, 0.5); },
    zap: (o, d) => { noise(0.25, 0.4, 3200, 1.5, "bandpass", d, 0, 0.4); tone(1200, 0.12, "sawtooth", 0.12, d, 0, 0.5); },
    flesh: (o, d) => noise(0.06, 0.35, 500, 1, "lowpass", d),
    crit: (o, d) => { noise(0.08, 0.5, 400, 1, "lowpass", d); tone(1800, 0.05, "triangle", 0.1, d); },
    ric: (o, d) => tone(2600 + Math.random() * 1400, 0.14, "sine", 0.12, d, 0, 0.6),
    hitwall: (o, d) => noise(0.05, 0.3, 1400, 1, "bandpass", d),
    casing: (o, d) => tone(3800 + Math.random() * 900, 0.05, "triangle", 0.06, d),
    hurt: (o, d) => { noise(0.12, 0.5, 300, 1, "lowpass", d); tone(180, 0.15, "sine", 0.3, d, 0, 0.6); },
    die: (o, d) => { noise(0.3, 0.4, 400, 1, "lowpass", d); tone(160, 0.3, "sawtooth", 0.15, d, 0, 0.5); },
    zdie: (o, d) => { groan(d, 0.5, 0.45, 0.7); noise(0.2, 0.35, 350, 1, "lowpass", d); },
    yelp: (o, d) => { tone(900, 0.2, "sawtooth", 0.2, d, 0, 0.5); noise(0.15, 0.3, 1200, 2, "bandpass", d); },
    groan: (o, d) => groan(d, rnd(0.8, 1.5), 0.32, o.zt === "brute" ? 0.6 : 1),
    growl: (o, d) => { const s = tone(70, 0.6, "sawtooth", 0.18, d, 0, 1.3); noise(0.6, 0.15, 500, 3, "bandpass", d); },
    snarl: (o, d) => { groan(d, 0.35, 0.4, 1.5); noise(0.2, 0.3, 1500, 2, "bandpass", d); },
    bark: (o, d) => { tone(420, 0.12, "sawtooth", 0.3, d, 0, 0.6); noise(0.12, 0.3, 1100, 2, "bandpass", d); tone(380, 0.12, "sawtooth", 0.25, d, 0.18, 0.6); },
    roar: (o, d) => { groan(d, 1.2, 0.7, 0.45); noise(1, 0.4, 300, 1, "lowpass", d); },
    hiss: (o, d) => noise(0.6, 0.35, 4000, 1, "highpass", d, 0, 0.6),
    swipe: (o, d) => noise(0.12, 0.3, 1800, 2, "bandpass", d, 0, 0.4),
    slam: (o, d) => { tone(60, 0.4, "sine", 0.9, d, 0, 0.5); noise(0.3, 0.7, 300, 1, "lowpass", d); },
    dirt: (o, d) => noise(0.5, 0.25, 400, 0.8, "lowpass", d, 0, 0.5),
    boardbreak: (o, d) => { noise(0.12, 0.6, 900, 1.2, "bandpass", d); tone(220, 0.08, "square", 0.12, d); noise(0.2, 0.3, 400, 1, "lowpass", d, 0.05); },
    hammer: (o, d) => { tone(300, 0.06, "square", 0.2, d); noise(0.05, 0.4, 1500, 2, "bandpass", d); tone(280, 0.06, "square", 0.18, d, 0.14); noise(0.05, 0.35, 1400, 2, "bandpass", d, 0.14); },
    door: (o, d) => { noise(0.5, 0.4, 600, 1, "lowpass", d); tone(90, 0.5, "sawtooth", 0.15, d, 0, 0.6); },
    debris: (o, d) => { for (let k = 0; k < 6; k++) noise(0.15, 0.35, 300 + k * 200, 1, "bandpass", d, k * 0.06); },
    buy: (o, d) => { tone(1047, 0.08, "square", 0.12, d); tone(1568, 0.14, "square", 0.12, d, 0.07); noise(0.05, 0.2, 5000, 3, "bandpass", d, 0.02); },
    deny: (o, d) => { tone(150, 0.14, "square", 0.15, d); tone(130, 0.14, "square", 0.15, d, 0.12); },
    pickup: (o, d) => { noise(0.08, 0.3, 1800, 3, "bandpass", d); tone(660, 0.08, "triangle", 0.1, d, 0.05); },
    ammo: (o, d) => noise(0.08, 0.3, 2400, 3, "bandpass", d),
    box: (o, d) => { const notes = [784, 659, 698, 523, 587, 659, 784, 1047, 988, 880, 784]; notes.forEach((f, i) => tone(f, 0.3, "triangle", 0.12, d, i * 0.3)); },
    boxdone: (o, d) => { tone(1568, 0.5, "sine", 0.12, d); tone(2093, 0.6, "sine", 0.1, d, 0.08); },
    skull: (o, d) => { [220, 207, 196, 185].forEach((f, i) => tone(f, 0.4, "sawtooth", 0.15, d, i * 0.3)); noise(1.2, 0.2, 200, 1, "lowpass", d); },
    perk: (o, d) => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.08, d, i * 0.11)); noise(0.3, 0.2, 3000, 1, "highpass", d, 0.7); },
    power: (o, d) => { tone(60, 2.2, "sawtooth", 0.25, d, 0, 2.5, 0.8); noise(0.3, 0.6, 400, 1, "lowpass", d, 2.0); tone(120, 1.0, "square", 0.08, d, 2.0); },
    forged: (o, d) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, "sawtooth", 0.08, d, i * 0.09)); },
    anvil: (o, d) => tone(1800 + Math.random() * 600, 0.15, "triangle", 0.15, d),
    puspawn: (o, d) => { [1319, 1568, 1976].forEach((f, i) => tone(f, 0.3, "sine", 0.08, d, i * 0.07)); },
    pu_ammo: (o, d) => sting(d, [392, 523, 659, 784], "square"),
    pu_double: (o, d) => sting(d, [523, 659, 523, 784], "square"),
    pu_insta: (o, d) => sting(d, [330, 311, 294, 247], "sawtooth"),
    pu_nuke: (o, d) => { sounds.boom(o, d); sting(d, [196, 185, 175], "sawtooth"); },
    pu_barrier: (o, d) => sting(d, [440, 554, 659], "triangle"),
    pu_sale: (o, d) => sting(d, [659, 784, 880, 1047, 1319], "square"),
    roundstart: (o, d) => { [110, 131, 165].forEach((f) => tone(f, 2.6, "sawtooth", 0.12, d, 0, 1, 0.5)); [0, 0.5, 1.0].forEach((w) => { tone(55, 0.4, "sine", 0.6, d, w, 0.6); noise(0.3, 0.3, 200, 1, "lowpass", d, w); }); },
    roundend: (o, d) => { [440, 523, 659, 880].forEach((f, i) => tone(f, 2.5, "sine", 0.09, d, i * 0.18)); },
    houndround: (o, d) => { noise(3, 0.25, 500, 0.5, "bandpass", d, 0, 0.3, 1); tone(220, 2.5, "sawtooth", 0.08, d, 0.5, 0.5, 1); sounds.roundstart(o, d); },
    thunder: (o, d) => { noise(2.8, 0.5, 160, 0.6, "lowpass", d, 0, 0.5, 0.2); noise(1.2, 0.3, 500, 0.6, "lowpass", d, 0.2); },
    down: (o, d) => { tone(220, 0.8, "sawtooth", 0.15, d, 0, 0.5); tone(110, 1.2, "sine", 0.3, d, 0.1, 0.6); },
    revive: (o, d) => { [392, 523, 659].forEach((f, i) => tone(f, 0.25, "triangle", 0.12, d, i * 0.08)); },
    killtick: (o, d) => { tone(1700, 0.05, "square", 0.08, d); tone(2400, 0.06, "square", 0.06, d, 0.04); },
    hittick: (o, d) => tone(3000, 0.03, "square", 0.05, d),
    streak: (o, d) => sting(d, [523, 659, 784, 1047], "sawtooth"),
    incoming: (o, d) => { tone(1800, 1.6, "sine", 0.15, d, 0, 0.35, 0.2); },
    click: (o, d) => { tone(1100, 0.04, "square", 0.08, d); },
    back: (o, d) => tone(520, 0.08, "triangle", 0.1, d, 0, 0.6),
    rankup: (o, d) => sting(d, [523, 659, 784, 1047, 1319, 1568], "square"),
  };
  function sting(d, notes, type) { notes.forEach((f, i) => { tone(f, 0.22, type, 0.1, d, i * 0.09); tone(f / 2, 0.22, "triangle", 0.08, d, i * 0.09); }); }
  function groan(d, dur, vol, pitch) {
    const t = T(), o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = "sawtooth"; const f0 = rnd(75, 120) * pitch;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rnd(0.7, 1.1), t + dur);
    lfo.frequency.value = rnd(4, 8); lg.gain.value = f0 * 0.08; lfo.connect(lg); lg.connect(o.frequency);
    const f1 = ac.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = rnd(380, 650); f1.Q.value = 6;
    const f2 = ac.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = rnd(900, 1400); f2.Q.value = 8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(d);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    noise(dur * 0.8, vol * 0.25, 700, 1.5, "bandpass", d, 0, 1, dur * 0.3);
  }

  function play(name, o = {}) {
    if (!ac || !sfxOn || ac.state !== "running") return;
    const tnow = T();
    const key = name === "gun" ? "gun" : name;
    // voice limiting so a big fight doesn't turn into noise
    const lim = { gun: 9, groan: 2, flesh: 4, hitwall: 3, ric: 2, casing: 3, snarl: 3, boom: 4 }[key] || 6;
    const r = recent[key] || (recent[key] = []);
    while (r.length && tnow - r[0] > 0.08) r.shift();
    if (r.length >= lim) return;
    r.push(tnow);
    const [v0, pan, muf] = spatial(o.x, o.y);
    const v = v0 * (o.v === undefined ? 1 : o.v);
    if (v < 0.02) return;
    if (name === "gun") { gunshot(o.g, Math.min(1.2, v * 1.1), pan, muf, o.up); return; }
    const fn = sounds[name]; if (!fn) return;
    const g = ac.createGain(); g.gain.value = v;
    g.connect(out(pan, muf, ["boom", "thunder", "roundstart", "houndround", "power", "roar"].includes(name) ? 0.5 : 0.1));
    fn(o, g);
  }

  /* ---------- ambience ---------- */
  function ambient(kind) {
    if (!ac) return;
    if (ambNode) { try { ambNode.stop(); } catch (_) {} ambNode = null; }
    if (!kind) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(), g = ac.createGain();
    if (kind === "rain") { f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 0.4; g.gain.value = 0.11; }
    else if (kind === "fog") { f.type = "lowpass"; f.frequency.value = 380; g.gain.value = 0.14; }
    else { f.type = "lowpass"; f.frequency.value = 700; g.gain.value = 0.06; }
    s.connect(f); f.connect(g); g.connect(sfx); s.start();
    ambNode = s; ambGain = g;
  }

  /* ---------- music: a small sequencer ---------- */
  const SONGS = {
    menu: { bpm: 70, root: 45, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], mel: [12, 15, 14, 10, 12, 7, 8, 10], drums: 0, bass: 1, bell: 0.35 },
    zombies: { bpm: 64, root: 40, prog: [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-2, 1, 5]], mel: [15, 14, 12, 13], drums: 1, bass: 1, bell: 0.22, sparse: true },
    tdm: { bpm: 122, root: 40, prog: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]], mel: [12, 10, 7, 10, 12, 15, 14, 10], drums: 2, bass: 2, bell: 0.1 },
    over: { bpm: 56, root: 38, prog: [[0, 3, 7], [-4, 0, 3]], mel: [12, 10, 8, 7], drums: 0, bass: 1, bell: 0.4 },
  };
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function startMusic(id) {
    if (!ac) return;
    stopMusic();
    const S = SONGS[id]; if (!S) return;
    const step = 60 / S.bpm / 2;      // 8th notes
    let n = 0, next = T() + 0.1;
    seq = { id, timer: setInterval(() => {
      if (!ac || ac.state !== "running") return;
      while (next < T() + 0.25) {
        const bar = Math.floor(n / 8) % S.prog.length, beat = n % 8, ch = S.prog[bar];
        if (beat === 0) for (const iv of ch) { const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = o2.type = "sawtooth"; o.frequency.value = mf(S.root + 24 + iv); o2.frequency.value = mf(S.root + 24 + iv) * 1.006; f.type = "lowpass"; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, next); g.gain.linearRampToValueAtTime(0.035, next + step * 2); g.gain.linearRampToValueAtTime(0.0001, next + step * 8); o.connect(f); o2.connect(f); f.connect(g); g.connect(music); o.start(next); o2.start(next); o.stop(next + step * 8 + 0.1); o2.stop(next + step * 8 + 0.1); }
        if (S.bass === 2 || (S.bass === 1 && beat % 4 === 0)) { const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = "sawtooth"; o.frequency.value = mf(S.root + ch[0] + (S.bass === 2 && beat % 2 ? 12 : 0)); f.type = "lowpass"; f.frequency.value = 420; g.gain.setValueAtTime(0.0001, next); g.gain.linearRampToValueAtTime(0.12, next + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, next + step * (S.bass === 2 ? 0.9 : 3.5)); o.connect(f); f.connect(g); g.connect(music); o.start(next); o.stop(next + step * 4); }
        if (S.drums >= 1 && beat % 4 === 0) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(110, next); o.frequency.exponentialRampToValueAtTime(40, next + 0.15); g.gain.setValueAtTime(S.drums === 2 ? 0.5 : 0.25, next); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.3); o.connect(g); g.connect(music); o.start(next); o.stop(next + 0.35); }
        if (S.drums === 2 && beat % 2 === 1) { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 7000; g.gain.setValueAtTime(0.06, next); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.05); s.connect(f); f.connect(g); g.connect(music); s.start(next, Math.random()); s.stop(next + 0.06); }
        if (S.drums === 2 && beat === 4) { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = 1800; g.gain.setValueAtTime(0.18, next); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.18); s.connect(f); f.connect(g); g.connect(music); s.start(next, Math.random()); s.stop(next + 0.2); }
        if (Math.random() < S.bell && (!S.sparse || beat % 2 === 0)) { const note = S.root + 24 + S.mel[(n >> 1) % S.mel.length] + ch[0]; const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = mf(note); g.gain.setValueAtTime(0.0001, next); g.gain.linearRampToValueAtTime(0.05, next + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, next + 2.2); o.connect(g); g.connect(music); g.connect(wet); o.start(next); o.stop(next + 2.3); }
        next += step; n++;
      }
    }, 90) };
  }
  function stopMusic() { if (seq) { clearInterval(seq.timer); seq = null; } }

  return {
    unlock, play, spatial,
    setListeners(l) { listeners = l.length ? l : [{ x: 0, y: 0 }]; },
    music(id) { if (seq && seq.id === id) return; startMusic(id); },
    stopMusic, ambient,
    setMusic(on) { musicOn = on; if (music) music.gain.value = on ? MUSIC_VOL : 0; },
    setSfx(on) { sfxOn = on; if (sfx) sfx.gain.value = on ? SFX_VOL : 0; },
    suspend() { if (ac && ac.state === "running") ac.suspend(); },
    resume() { if (ac && unlocked) ac.resume(); },
    get ok() { return !!ac && ac.state === "running"; },
  };
})();
