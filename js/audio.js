// Small Web Audio cues. Off by default when the system asks for reduced motion.
const KEY = "pd.sound";
let ctx = null;
let on = (() => {
  try { const v = localStorage.getItem(KEY); if (v !== null) return v === "1"; } catch (e) {}
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
})();

export const soundOn = () => on;

export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {}
}

function tone(freq, dur, type = "sine", vol = 0.06, when = 0) {
  if (!on) return;
  try {
    ctx = ctx || new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) {}
}

export const tick = () => tone(660, 0.08, "triangle", 0.04);

// Two notes per round: consonant when both cooperate, a low knock for each defection.
export function reveal(a, b) {
  const pitch = { C: 523.25, D: 196 };
  tone(pitch[a], 0.35, a === "C" ? "sine" : "square", a === "C" ? 0.06 : 0.025);
  tone(a === b && a === "C" ? 659.25 : pitch[b], 0.4, b === "C" ? "sine" : "square", b === "C" ? 0.06 : 0.025, 0.12);
}

export const finish = (won) => [0, 0.14, 0.28].forEach((w, i) => tone(won ? [392, 494, 587][i] : [330, 294, 247][i], 0.5, "sine", 0.05, w));
