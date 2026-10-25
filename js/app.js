// Prisoner's Dilemma: screens, routing, the solo game and the online match.
import { STRATEGIES, byKey, decide, scoreRound } from "./strategies.js";
import { fingerprint, fromSide, MIN_ROUNDS } from "./fingerprint.js";
import { IDEAS } from "./ideas.js";
import * as audio from "./audio.js";
import * as net from "./net.js";

const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (id, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}" /></svg>`;
const ornament = `<div class="rule-orn" aria-hidden="true"><svg><use href="#i-hedera" /></svg></div>`;
const MOVE_WORD = { C: "cooperated", D: "defected" };
const MOVE_VERB = { C: "cooperate", D: "defect" };

const LENGTHS = {
  standard: { label: "Standard", min: 10, max: 16 },
  long: { label: "Long", min: 20, max: 30 },
  axelrod: { label: "Axelrod's 200", min: 200, max: 200 }
};
const rangeText = (min, max) => (min === max ? `${max}` : `${min} to ${max}`);

// Shaky hands: with noise on, 1 move in 20 comes out the other way.
const shake = (move, noise) => (noise && Math.random() < 0.05 ? (move === "C" ? "D" : "C") : move);
const shakyChoice = `<div class="choices"><label><input type="checkbox" name="noise" /><span>Shaky hands<small>1 move in 20 comes out the other way</small></span></label></div>`;

// A match is judged against the table, not the opponent: steady cooperation pays 3 a round to both.
const grade = (pts, n) => (pts / n >= 2.5 ? "prospered" : pts / n >= 1.5 ? "got by" : "starved");
function verdictHead(a, b, n, them) {
  const [ga, gb] = [grade(a, n), grade(b, n)];
  return ga === gb ? `You both ${ga}` : `You ${ga}. ${them} ${gb}`;
}
const tally = (a, b, n) => `<p>${a} to ${b} over ${n} rounds. Cooperating every round would have paid ${3 * n} each.</p>`;

let auth = { session: null, user: null, profile: null };
let cleanup = () => {};

// The woodcut module pulls three.js from a CDN; if that fails, pictures fall back to text.
let woodcutLoad = null;
const woodcut = () => (woodcutLoad ??= import("./woodcut.js").then((m) => (m.supported() ? m : null)).catch(() => null));

async function livePicture(el, key, label) {
  const W = await woodcut();
  if (!el.isConnected) return null;
  if (!W) {
    el.innerHTML = `<div class="pic-fallback">${esc(byKey[key]?.motto || "Prisoner's Dilemma")}</div>`;
    return null;
  }
  const p = W.mount(el, key);
  el.querySelector("canvas")?.setAttribute("aria-label", label);
  return p;
}

async function fillStills(root) {
  const W = await woodcut();
  const slots = [...root.querySelectorAll("[data-still]")];
  for (const slot of slots) {
    if (!slot.isConnected) return;
    const key = slot.dataset.still;
    const url = W && W.still(key);
    slot.innerHTML = url
      ? `<img src="${url}" alt="" width="260" height="260" />`
      : `<div class="pic-fallback">${esc(byKey[key]?.motto)}</div>`;
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ---------------------------------------------------------------- shared pieces

function tilesHTML(rounds, side, freshFrom = Infinity, pendingMine = false) {
  const tiles = rounds.map((r, i) => {
    const m = r[side], slip = side === "me" && r.slip;
    const label = `Round ${i + 1}: ${side === "me" ? "you" : "they"} ${MOVE_WORD[m]}${slip ? ", your hand slipped" : ""}`;
    return `<span class="tile ${m}${slip ? " slip" : ""}${i >= freshFrom ? " fresh" : ""}" role="img" aria-label="${label}"></span>`;
  });
  if (pendingMine) tiles.push(`<span class="tile pending" role="img" aria-label="Your move is sealed"></span>`);
  return tiles.join("");
}

function recordHTML(rounds, youName, themName, opts = {}) {
  return `<div class="record${opts.mini ? " mini" : ""}">
    <div class="record-row"><span>${esc(youName)}</span><div class="tiles">${tilesHTML(rounds, "me", opts.freshFrom, opts.pendingMine)}</div></div>
    <div class="record-row"><span>${esc(themName)}</span><div class="tiles">${tilesHTML(rounds, "them", opts.freshFrom, opts.pendingTheirs)}</div></div>
  </div>`;
}

const legend = `<div class="legend" aria-hidden="true"><span><i class="tile C"></i> cooperated</span><span><i class="tile D"></i> defected</span></div>`;

function totals(rounds) {
  return rounds.reduce((t, r) => {
    const [a, b] = scoreRound(r.me, r.them);
    return [t[0] + a, t[1] + b];
  }, [0, 0]);
}

function lookalike(rounds) {
  const fp = fingerprint([rounds]);
  if (fp.rounds < 4) return "";
  const t = fp.top[0];
  return `<p>In this match you played most like <a href="#/c/${t.key}">${esc(t.name)}</a> (${t.pct}%).</p>`;
}

function setTitle(t) {
  document.title = t ? `${t} · Prisoner's Dilemma` : "Prisoner's Dilemma";
}

function markNav(path) {
  document.querySelectorAll(".running-nav a").forEach((a) => {
    const target = a.getAttribute("href").slice(2);
    if (target && path.startsWith(target)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function signInBlock(why) {
  if (!net.configured()) {
    return `<p class="notice">Online play needs the game server, which isn't connected yet. You can still play every character on this device.</p>`;
  }
  return `<div class="stack"><p>${why}</p><div><button class="btn btn-lapis" data-act="signin">Continue with Google</button></div>
    <p class="soft">We keep your name, picture and game record. Nothing else. See the <a href="privacy.html">privacy page</a>.</p></div>`;
}

function bindSignIn(root) {
  root.querySelectorAll('[data-act="signin"]').forEach((b) => b.addEventListener("click", () => net.signIn(location.hash || "#/")));
}

// ---------------------------------------------------------------- home

function home() {
  setTitle("");
  app.innerHTML = `<div class="screen spread title-spread">
    <section class="leaf framed title-page" aria-labelledby="t">
      <h1 id="t">Prisoner's Dilemma</h1>
      <p class="sub">An emblem book of trust and betrayal, in twenty‑five characters</p>
      <div class="device" id="device"></div>
      <p class="verse">Two players choose in secret, cooperate or defect. Then both choices are shown, and it happens again.</p>
      <p class="imprint">Set out by Azizullah Tanim, 2026</p>
    </section>
    <nav class="leaf contents" aria-label="Contents">
      <h2>The Contents</h2>
      <p class="lede">Each character is a rule for playing the game, taken from fifty years of game theory. Play them, play a friend, and find out which one you are.</p>
      <ol>
        <li><a href="#/characters"><strong>Play a character</strong><span>Pick one of the 25 and play it here, no sign-in needed.</span>${icon("i-manicule")}</a></li>
        <li><a href="#/gauntlet"><strong>The gauntlet</strong><span>Five characters in a row, one total, ranked against all 25.</span>${icon("i-manicule")}</a></li>
        <li><a href="#/online"><strong>Play a person</strong><span>Invite a friend or meet a stranger online, and talk while you play.</span>${icon("i-manicule")}</a></li>
        <li><a href="#/me"><strong>Your emblem</strong><span>Your record, and the character you play most like.</span>${icon("i-manicule")}</a></li>
        <li><a href="#/ideas"><strong>The ideas</strong><span>Hobbes, Rousseau, Kant, Axelrod and others, in short chapters.</span>${icon("i-manicule")}</a></li>
        <li><a href="#/rules"><strong>The rules</strong><span>The points, and how a match runs.</span>${icon("i-manicule")}</a></li>
      </ol>
    </nav>
  </div>`;
  let pic = null;
  livePicture(app.querySelector("#device"), "device", "A woodcut of an open hand and a closed fist").then((p) => (pic = p));
  return () => pic?.dispose();
}

// ---------------------------------------------------------------- catalog

function catalog() {
  setTitle("Characters");
  const card = (s) => `<a class="leaf emblem-card" href="#/c/${s.key}" data-badge="${s.badge}">
      <p class="motto">${esc(s.motto)}</p>
      <div class="pic" data-still="${s.key}"></div>
      <h3>${esc(s.name)}</h3>
      <p>${esc(s.rule)}</p>
      <span class="badge" data-k="${s.badge}">${s.badge}</span>
    </a>`;
  app.innerHTML = `<div class="screen">
    <div class="catalog-head">
      <div><h1 class="page-title">The Characters</h1>
      <p>Twenty-five ways to play the same game. Nice ones never defect first. Nasty ones do. Pick one to read its rule and play it.</p></div>
      <div class="filters" role="group" aria-label="Show">
        <button aria-pressed="true" data-f="all">All</button><button aria-pressed="false" data-f="Nice">Nice</button>
        <button aria-pressed="false" data-f="Nasty">Nasty</button><button aria-pressed="false" data-f="Random">Random</button>
      </div>
    </div>
    <div class="catalog">${STRATEGIES.map(card).join("")}</div>
  </div>`;
  app.querySelector(".filters").addEventListener("click", (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    app.querySelectorAll(".filters button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.f === f));
    app.querySelectorAll(".emblem-card").forEach((c) => (c.hidden = f !== "all" && c.dataset.badge !== f));
  });
  fillStills(app);
  return () => {};
}

// ---------------------------------------------------------------- character page

function emblemLeaf(s, pictureId) {
  return `<section class="leaf framed emblem" aria-labelledby="name-${s.key}">
    <p class="motto">${esc(s.motto)}</p>
    <div class="picture" id="${pictureId}"></div>
    <h2 id="name-${s.key}">${esc(s.name)}</h2>
    <p class="verse">“${esc(s.quote)}”</p>
  </section>`;
}

function character(key) {
  const s = byKey[key];
  if (!s) return notFound();
  setTitle(s.name);
  app.innerHTML = `<div class="screen spread">
    ${emblemLeaf(s, "pic")}
    <section class="leaf">
      <dl class="facts">
        <div><dt>The rule</dt><dd>${esc(s.rule)}</dd></div>
        <div><dt>Where it comes from</dt><dd>${esc(s.idea)}</dd></div>
        <div><dt>Temper</dt><dd><span class="badge" data-k="${s.badge}">${s.badge}</span></dd></div>
      </dl>
      ${ornament}
      <form class="setup" id="setup">
        <fieldset><legend>How long a match</legend><div class="choices">
          ${Object.entries(LENGTHS).map(([k, l]) => `<label><input type="radio" name="len" value="${k}" ${k === "standard" ? "checked" : ""} /><span>${l.label}<small>${rangeText(l.min, l.max)} rounds</small></span></label>`).join("")}
        </div></fieldset>
        <p class="soft">With a range, the true length stays hidden until the match ends, so there is no last round to plan for. Axelrod's first tournament ran 200 rounds, and everyone knew it.</p>
        ${shakyChoice}
        <div class="btn-row"><button class="btn btn-lapis" type="submit">Play ${esc(s.name)}</button><a href="#/characters">Back to all characters</a></div>
      </form>
    </section>
  </div>`;
  let pic = null;
  livePicture(app.querySelector("#pic"), key, `Woodcut picture for ${s.name}`).then((p) => (pic = p));
  app.querySelector("#setup").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target), l = LENGTHS[f.get("len")];
    saveSolo({ key, min: l.min, max: l.max, total: drawLength(l), noise: f.has("noise"), rounds: [] });
    location.hash = `#/play/${key}`;
  });
  return () => pic?.dispose();
}

// ---------------------------------------------------------------- solo game

const drawLength = (l) => l.min + Math.floor(Math.random() * (l.max - l.min + 1));
const SOLO = "pd.solo";
const saveSolo = (g) => { try { sessionStorage.setItem(SOLO, JSON.stringify(g)); } catch (e) {} };
function loadSolo(key) {
  try {
    const g = JSON.parse(sessionStorage.getItem(SOLO));
    if (g && g.key === key && Array.isArray(g.rounds)) return g;
  } catch (e) {}
  return null;
}

// What a character would have scored against this opponent over the same length, averaged over runs.
function wouldHaveScored(opp, total, noise) {
  return STRATEGIES.map((s) => {
    const runs = 12;
    let sum = 0;
    for (let k = 0; k < runs; k++) {
      const h = [];
      for (let i = 0; i < total; i++) {
        const a = shake(decide(s, h), noise), b = shake(decide(opp, h.map((x) => ({ me: x.them, them: x.me }))), noise);
        h.push({ me: a, them: b });
      }
      sum += totals(h)[0];
    }
    return { name: s.name, key: s.key, score: Math.round(sum / runs) };
  });
}

// ---------------------------------------------------------------- the gauntlet

const RUN = 5;

function gauntlet() {
  setTitle("The gauntlet");
  app.innerHTML = `<div class="screen"><article class="leaf framed prose" style="margin:0 auto">
    <h1>The gauntlet</h1>
    ${ornament}
    <p>Five characters drawn at random, one after another, each for 10 to 16 rounds. Only your total counts.</p>
    <p>Beating a character head to head is easy: defect first and you can't lose a match. But the hard cases hit back, and they get the rest of the match to do it. At the end your total is set beside what each of the 25 characters would have scored against the same five.</p>
    <p>Tit for Tat never beat a single opponent in Axelrod's tournament, and it still won.</p>
    <form id="run" class="stack">${shakyChoice}<div class="btn-row"><button class="btn btn-lapis" type="submit">Draw five characters</button></div></form>
  </article></div>`;
  app.querySelector("#run").addEventListener("submit", (e) => {
    e.preventDefault();
    const keys = STRATEGIES.map((x) => x.key).sort(() => Math.random() - 0.5).slice(0, RUN);
    const run = { keys, totals: keys.map(() => drawLength(LENGTHS.standard)), scores: [] };
    startLeg(run, new FormData(e.target).has("noise"));
  });
  return () => {};
}

function startLeg(run, noise) {
  const i = run.scores.length, l = LENGTHS.standard;
  saveSolo({ key: run.keys[i], min: l.min, max: l.max, total: run.totals[i], noise, rounds: [], run });
  location.hash = `#/play/${run.keys[i]}`;
}

function runResult(run, noise) {
  const mine = run.scores.reduce((t, x) => t + x, 0);
  const n = run.totals.reduce((t, x) => t + x, 0);
  const board = STRATEGIES.map((s, k) => ({
    name: s.name, key: s.key,
    score: run.keys.reduce((t, opp, i) => t + wouldHaveScored(byKey[opp], run.totals[i], noise)[k].score, 0)
  })).concat({ name: "You", key: "you", score: mine }).sort((x, y) => y.score - x.score);
  const place = board.findIndex((r) => r.key === "you") + 1;
  return `<h3>The gauntlet is over. You ${grade(mine, n)}</h3>
    <p>${mine} points from ${n} rounds against ${run.keys.map((k) => esc(byKey[k].name)).join(", ")}. Next to every character playing the same five, you place ${place} of 26.</p>
    <ol class="ranking">${board.slice(0, 8).map((r) => `<li class="${r.key === "you" ? "you" : ""}"><span>${esc(r.name)}</span><span class="num">${r.score}</span></li>`).join("")}</ol>`;
}

function solo(key) {
  const s = byKey[key];
  if (!s) return notFound();
  const g = loadSolo(key);
  if (!g) { location.replace(`#/c/${key}`); return () => {}; }
  setTitle(`Playing ${s.name}`);

  app.innerHTML = `<div class="screen spread play-spread">
    ${emblemLeaf(s, "pic")}
    <section class="leaf board" aria-label="The match">
      <div class="score">
        <div><span class="who">You</span><span class="pts" id="pts-me">0</span></div>
        <div class="round" id="round"></div>
        <div><span class="who">${esc(s.name)}</span><span class="pts" id="pts-them">0</span></div>
      </div>
      <div id="record"></div>
      ${legend}
      ${g.run ? `<p class="soft">The gauntlet, character ${g.run.scores.length + (g.saved ? 0 : 1)} of ${RUN}.</p>` : ""}
      ${g.noise ? `<p class="soft">Shaky hands: 1 move in 20 comes out the other way, yours and theirs.</p>` : ""}
      <p class="status-line" id="status" role="status"></p>
      <div id="controls"></div>
    </section>
  </div>`;

  const $ = (id) => app.querySelector("#" + id);
  let pic = null, busy = false, timer = 0;
  livePicture($("pic"), key, `Woodcut picture for ${s.name}`).then((p) => (pic = p));

  function draw(freshFrom) {
    const [a, b] = totals(g.rounds);
    $("pts-me").textContent = a;
    $("pts-them").textContent = b;
    const done = g.rounds.length >= g.total;
    $("round").textContent = done
      ? `${g.total} rounds`
      : `Round ${g.rounds.length + 1} of ${rangeText(g.min, g.max)}`;
    $("record").innerHTML = recordHTML(g.rounds, "You", s.name, { freshFrom });
    if (done) return finish();
    $("controls").innerHTML = `<div class="moves">
        <button class="btn btn-coop" data-move="C">${icon("i-open")} Cooperate</button>
        <button class="btn btn-defect" data-move="D">${icon("i-fist")} Defect</button>
      </div>
      <p class="kbd">Keys: <kbd>C</kbd> cooperate, <kbd>D</kbd> defect</p>`;
  }

  function play(meant) {
    if (busy || g.rounds.length >= g.total) return;
    busy = true;
    audio.tick();
    app.querySelectorAll("[data-move]").forEach((b) => (b.disabled = true));
    $("status").textContent = `${s.name} is choosing.`;
    timer = setTimeout(() => {
      const them = shake(decide(s, g.rounds.map((r) => ({ me: r.them, them: r.me }))), g.noise);
      const me = shake(meant, g.noise);
      g.rounds.push(me === meant ? { me, them } : { me, them, slip: true });
      saveSolo(g);
      pic?.react(me);
      audio.reveal(me, them);
      $("status").textContent = `${me === meant ? "" : `Your hand slipped: you meant to ${MOVE_VERB[meant]}. `}You ${MOVE_WORD[me]}. ${s.name} ${MOVE_WORD[them]}.`;
      busy = false;
      draw(g.rounds.length - 1);
    }, 550 + Math.random() * 250);
  }

  function finish() {
    const [a, b] = totals(g.rounds);
    if (!g.saved) g.run?.scores.push(a);
    const run = g.run, last = run && run.scores.length >= RUN;
    audio.finish(grade(a, g.total) !== "starved");
    let ranking = "";
    if (!run) {
      const board = wouldHaveScored(s, g.total, g.noise).concat({ name: "You", key: "you", score: a }).sort((x, y) => y.score - x.score);
      const place = board.findIndex((r) => r.key === "you") + 1;
      ranking = `<p>Against ${esc(s.name)} over ${g.total} rounds, your ${a} points would place you ${place} of 26 next to every character playing the same match.</p>
      <ol class="ranking">${board.slice(0, 6).map((r) => `<li class="${r.key === "you" ? "you" : ""}"><span>${esc(r.name)}</span><span class="num">${r.score}</span></li>`).join("")}</ol>`;
    }
    const buttons = !run
      ? `<button class="btn btn-lapis" data-act="again">Play again</button><a class="btn btn-quiet" href="#/characters">Choose another</a>`
      : last
        ? `<a class="btn btn-lapis" href="#/gauntlet">Run another gauntlet</a>`
        : `<button class="btn btn-lapis" data-act="next">Next: ${esc(byKey[run.keys[run.scores.length]].name)}</button>`;
    $("controls").innerHTML = `<div class="verdict">
      <h3>${esc(verdictHead(a, b, g.total, s.name))}</h3>
      ${tally(a, b, g.total)}
      <p>${esc(s.after)}</p>
      ${lookalike(g.rounds)}
      ${ranking}
      ${last ? runResult(run, g.noise) : ""}
      <p class="soft" id="saved"></p>
      <div class="btn-row">${buttons}</div>
    </div>`;
    $("controls").querySelector('[data-act="again"]')?.addEventListener("click", () => {
      g.total = drawLength(g);
      g.rounds = [];
      g.saved = false;
      saveSolo(g);
      draw();
    });
    $("controls").querySelector('[data-act="next"]')?.addEventListener("click", () => startLeg(run, g.noise));
    if (!g.saved) {
      g.saved = true;
      saveSolo(g);
      if (auth.user) {
        // A slipped move is saved in lower case, so the emblem can leave it out.
        net.saveSolo(key, g.rounds.map((r) => (r.slip ? r.me.toLowerCase() : r.me)).join(""), g.rounds.map((r) => r.them).join(""))
          .then(() => ($("saved").textContent = "Saved to your record."))
          .catch((e) => ($("saved").textContent = `Not saved: ${e.message}`));
      } else if (net.configured()) {
        $("saved").textContent = "Sign in to keep a record of your games and see your emblem.";
      }
    }
  }

  app.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  function onClick(e) { const m = e.target.closest("[data-move]"); if (m && !m.disabled) play(m.dataset.move); }
  function onKey(e) {
    if (e.target.matches?.("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (k === "C" || k === "D") play(k);
  }
  draw();
  return () => {
    clearTimeout(timer);
    app.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
    pic?.dispose();
  };
}

// ---------------------------------------------------------------- online lobby

function lobby() {
  setTitle("Play a person");
  if (!auth.user) {
    app.innerHTML = `<div class="screen cols two"><section class="leaf framed stack"><h1>Play a person</h1>
      ${signInBlock("Online matches need a name to put on the record. Sign in with Google to invite a friend or meet a stranger.")}</section></div>`;
    bindSignIn(app);
    return () => {};
  }
  app.innerHTML = `<div class="screen stack">
    <div><h1 class="page-title">Play a person</h1>
    <p class="on-cloth">Both moves are sealed on the server until you have both chosen. You never learn the exact last round.</p></div>
    <div id="open"></div>
    <div class="cols two">
      <section class="leaf stack" aria-labelledby="inv">
        <h2 id="inv">Invite a friend</h2>
        <div id="invite">
          <fieldset><legend>How long a match</legend><div class="choices">
            ${["standard", "long"].map((k) => `<label><input type="radio" name="len" value="${k}" ${k === "standard" ? "checked" : ""} /><span>${LENGTHS[k].label}<small>${rangeText(LENGTHS[k].min, LENGTHS[k].max)} rounds</small></span></label>`).join("")}
          </div></fieldset>
          ${shakyChoice}
          <p><button class="btn btn-lapis" data-act="invite">Make an invite</button></p>
        </div>
      </section>
      <section class="leaf stack" aria-labelledby="str">
        <h2 id="str">Play a stranger</h2>
        <p>Wait for the next person looking for a match. Standard length, 10 to 16 rounds.</p>
        <div id="queue"><button class="btn" data-act="queue">Find someone</button></div>
        ${ornament}
        <h3>Join with a code</h3>
        <form class="note-form" id="join"><label class="visually-hidden" for="code">Invite code</label>
          <input type="text" id="code" maxlength="6" autocomplete="off" placeholder="Six letters, like K7PRQM" required />
          <button class="btn btn-quiet" type="submit">Join</button></form>
        <p class="soft" id="join-msg" role="status"></p>
      </section>
    </div>
  </div>`;

  const stops = [];
  let beat = 0;
  const goTo = (id) => (location.hash = `#/m/${id}`);
  const waitFor = async (m) => stops.push(await net.watch(m.id, { onMatch: (row) => row.status === "active" && goTo(m.id) }));

  net.openMatches().then((rows) => {
    const active = rows.filter((r) => r.status === "active");
    if (!active.length || !app.querySelector("#open")) return;
    app.querySelector("#open").innerHTML = `<section class="leaf"><h2>Matches in progress</h2><ul class="register">
      ${active.map((r) => `<li><a href="#/m/${r.id}">Round ${r.current_round} of ${rangeText(r.round_min, r.round_max)}</a><span class="soft">Your move may be waiting</span></li>`).join("")}</ul></section>`;
  }).catch(() => {});

  app.addEventListener("click", onClick);
  async function onClick(e) {
    const act = e.target.closest("[data-act]")?.dataset.act;
    try {
      if (act === "invite") {
        const len = app.querySelector('input[name="len"]:checked').value;
        const m = await net.createInvite(len, app.querySelector('input[name="noise"]').checked);
        const link = `${location.origin}${location.pathname}#/join/${m.invite_code}`;
        app.querySelector("#invite").innerHTML = `<p>Send this code or link to your friend. The match starts when they join.</p>
          <p class="code-big">${m.invite_code}</p>
          <p class="btn-row"><button class="btn btn-quiet" data-act="copy" data-link="${esc(link)}">Copy the link</button>
          <button class="btn btn-quiet" data-act="cancel" data-id="${m.id}">Cancel</button></p>
          <p class="waiting">Waiting for your friend</p>`;
        await waitFor(m);
      } else if (act === "copy") {
        await navigator.clipboard.writeText(e.target.dataset.link);
        e.target.textContent = "Copied";
      } else if (act === "cancel") {
        await net.forfeit(e.target.dataset.id);
        lobbyRestart();
      } else if (act === "queue") {
        const m = await net.joinQueue();
        if (m.status === "active") return goTo(m.id);
        app.querySelector("#queue").innerHTML = `<p class="waiting">Looking for someone. Keep this page open.</p>
          <button class="btn btn-quiet" data-act="leave-queue" data-id="${m.id}">Stop looking</button>`;
        await waitFor(m);
        // Calling again keeps our seat warm; strangers skip seats silent for 25 seconds.
        beat = setInterval(async () => {
          const again = await net.joinQueue().catch(() => null);
          if (again && again.status === "active") goTo(again.id);
        }, 10000);
      } else if (act === "leave-queue") {
        clearInterval(beat);
        await net.forfeit(e.target.dataset.id);
        lobbyRestart();
      }
    } catch (err) {
      alertIn(e.target.closest("section") || app, err.message);
    }
  }
  app.querySelector("#join").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      goTo(await net.joinInvite(app.querySelector("#code").value));
    } catch (err) {
      app.querySelector("#join-msg").textContent = /not found/.test(err.message) ? "No open invite has that code. Check the letters, or ask for a new one." : err.message;
    }
  });
  function lobbyRestart() { route(); }
  return () => { clearInterval(beat); stops.forEach((s) => s()); app.removeEventListener("click", onClick); };
}

function alertIn(el, msg) {
  el.querySelector(".notice.error")?.remove();
  el.insertAdjacentHTML("beforeend", `<p class="notice error" role="alert">${esc(msg)}</p>`);
}

function joinCode(code) {
  if (!auth.user) {
    setTitle("Join a match");
    app.innerHTML = `<div class="screen cols two"><section class="leaf framed stack"><h1>You've been invited</h1>
      ${signInBlock("Someone has invited you to a match. Sign in with Google to take your seat.")}</section></div>`;
    bindSignIn(app);
    return () => {};
  }
  app.innerHTML = `<div class="screen"><section class="leaf"><p class="waiting">Taking your seat</p></section></div>`;
  net.joinInvite(code).then((id) => location.replace(`#/m/${id}`)).catch((e) => {
    app.innerHTML = `<div class="screen"><section class="leaf stack"><h1>That invite can't be used</h1>
      <p>${/not found/.test(e.message) ? "It may have been used already, cancelled, or it's your own invite." : esc(e.message)}</p>
      <p><a class="btn" href="#/online">Go to the lobby</a></p></section></div>`;
  });
  return () => {};
}

// ---------------------------------------------------------------- online match

function match(id) {
  if (!auth.user) return lobby();
  setTitle("Match");
  const me = auth.user.id;
  let m = null, seat = "a", rounds = [], myPending = null, people = {}, pic = null;
  let stopWatch = null, poll = 0, idleTimer = 0, leaving = false, closed = false;

  app.innerHTML = `<div class="screen"><section class="leaf"><p class="waiting">Opening the match</p></section></div>`;

  const other = () => (seat === "a" ? m.player_b : m.player_a);
  const nameOf = (id) => people[id]?.display_name || "Your opponent";

  async function loadMoves() {
    const [rows, slips] = await Promise.all([net.moves(id), net.slips(id)]);
    const slipped = new Set(slips.map((x) => x.round));
    const byRound = {};
    rows.forEach((r) => ((byRound[r.round] ??= {})[r.seat] = r.move));
    rounds = [];
    myPending = null;
    Object.keys(byRound).map(Number).sort((a, b) => a - b).forEach((r) => {
      const x = byRound[r];
      if (x.a && x.b) rounds.push(seat === "a" ? { me: x.a, them: x.b, slip: slipped.has(r) } : { me: x.b, them: x.a, slip: slipped.has(r) });
      else if (x[seat]) myPending = x[seat];
    });
  }

  async function start() {
    m = await net.match(id);
    if (closed) return;
    if (!m) {
      app.innerHTML = `<div class="screen"><section class="leaf stack"><h1>No such match</h1><p>It may have been cancelled, or it belongs to other players.</p><p><a class="btn" href="#/online">Go to the lobby</a></p></section></div>`;
      return;
    }
    seat = m.player_a === me ? "a" : "b";
    (await net.profiles([m.player_a, m.player_b].filter(Boolean))).forEach((p) => (people[p.id] = p));
    await loadMoves();
    if (closed) return;
    layout();
    stopWatch = await net.watch(id, { onMatch: refresh, onMessage: addNote });
    poll = setInterval(() => net.match(id).then(refresh).catch(() => {}), 8000);
    idleTimer = setInterval(drawControls, 10000);
    net.messages(id).then((list) => list.forEach(addNote)).catch(() => {});
  }

  function layout() {
    const opp = people[other()];
    const oppKey = opp?.fingerprint?.top?.[0]?.key || "device";
    const look = opp?.fingerprint?.enough && byKey[oppKey] ? `Plays most like ${byKey[oppKey].name}` : "No record yet to read";
    app.innerHTML = `<div class="screen spread play-spread">
      <section class="leaf framed emblem" aria-label="Your opponent">
        <p class="motto">${esc(byKey[oppKey]?.motto || "Two hands, one choice")}</p>
        <div class="picture" id="pic"></div>
        <h2><a href="#/p/${other()}">${esc(nameOf(other()))}</a></h2>
        <p class="verse center">${esc(look)}</p>
        <p class="soft center">${esc(trustText(opp))}</p>
      </section>
      <section class="leaf board" aria-label="The match">
        <div class="score">
          <div><span class="who">You</span><span class="pts" id="pts-me">0</span></div>
          <div class="round" id="round"></div>
          <div><span class="who">${esc(nameOf(other()))}</span><span class="pts" id="pts-them">0</span></div>
        </div>
        <div id="record"></div>
        ${legend}
        ${m.noise ? `<p class="soft">Shaky hands: 1 move in 20 comes out the other way. Only the one whose hand slipped is told.</p>` : ""}
        <p class="status-line" id="status" role="status"></p>
        <div id="controls"></div>
        <section class="margin-notes" aria-labelledby="notes-h">
          <h3 id="notes-h">Notes in the margin</h3>
          <div class="notes" id="notes" aria-live="polite"><p class="empty">Nothing written yet. Say hello, make a promise, or don't.</p></div>
          <form class="note-form" id="note-form"><label class="visually-hidden" for="note">Write a note</label>
            <input type="text" id="note" maxlength="500" autocomplete="off" placeholder="Write to ${esc(nameOf(other()))}" />
            <button class="btn btn-quiet" type="submit">Send</button></form>
        </section>
      </section>
    </div>`;
    livePicture(app.querySelector("#pic"), oppKey, `Woodcut picture for ${nameOf(other())}`).then((p) => (pic = p));
    app.querySelector("#note-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = app.querySelector("#note");
      const body = input.value.trim();
      if (!body) return;
      input.value = "";
      try { await net.sendMessage(id, body); } catch (err) { input.value = body; alertIn(app.querySelector(".margin-notes"), err.message); }
    });
    draw();
  }

  const seen = new Set();
  function addNote(n) {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const box = app.querySelector("#notes");
    if (!box) return;
    box.querySelector(".empty")?.remove();
    const p = document.createElement("p");
    p.className = "note " + (n.sender === me ? "mine" : "theirs");
    const b = document.createElement("b");
    b.textContent = n.sender === me ? "You" : nameOf(n.sender);
    p.append(b, document.createTextNode(n.body));
    box.append(p);
    box.scrollTop = box.scrollHeight;
  }

  function draw(freshFrom) {
    const [a, b] = totals(rounds);
    app.querySelector("#pts-me").textContent = a;
    app.querySelector("#pts-them").textContent = b;
    const finished = m.status !== "active";
    app.querySelector("#round").textContent = finished
      ? `${rounds.length} rounds played`
      : `Round ${m.current_round} of ${rangeText(m.round_min, m.round_max)}`;
    app.querySelector("#record").innerHTML = recordHTML(rounds, "You", nameOf(other()), { freshFrom, pendingMine: !!myPending });
    drawControls();
  }

  function drawControls() {
    const box = app.querySelector("#controls");
    if (!box || !m) return;
    const status = app.querySelector("#status");
    if (m.status === "done" || m.status === "abandoned") return verdict(box);
    if (m.status === "waiting") {
      box.innerHTML = `<p class="waiting">Waiting for the other player to join</p>`;
      return;
    }
    if (myPending) {
      const idle = Date.now() - new Date(m.last_move_at).getTime() > 180000;
      status.textContent = `Your move is sealed. Waiting for ${nameOf(other())}.`;
      box.innerHTML = idle
        ? `<p>${esc(nameOf(other()))} hasn't moved in over three minutes.</p><div class="btn-row"><button class="btn" data-act="claim">End the match and take the win</button>${leaveBtn()}</div>`
        : `<div class="btn-row">${leaveBtn()}</div>`;
    } else {
      if (!rounds.length) status.textContent = "Make your first move. Your opponent can't see it until they've chosen too.";
      box.innerHTML = `<div class="moves">
          <button class="btn btn-coop" data-move="C">${icon("i-open")} Cooperate</button>
          <button class="btn btn-defect" data-move="D">${icon("i-fist")} Defect</button>
        </div>
        <p class="kbd">Keys: <kbd>C</kbd> cooperate, <kbd>D</kbd> defect</p>
        <div class="btn-row">${leaveBtn()}</div>`;
    }
  }

  const leaveBtn = () => `<button class="link-btn soft" data-act="leave">${leaving ? "Leaving counts as a loss. Press again to leave." : "Leave the match"}</button>`;

  function verdict(box) {
    const [a, b] = totals(rounds);
    const quitter = m.abandoned_by;
    let head;
    if (m.status === "abandoned") head = quitter === seat ? "You left the match" : `${nameOf(other())} left the match, so it's yours`;
    else head = verdictHead(a, b, rounds.length, nameOf(other()));
    const both = rounds.filter((r) => r.me === "C" && r.them === "C").length;
    box.innerHTML = `<div class="verdict">
      <h3>${esc(head)}</h3>
      ${m.status === "done" ? tally(a, b, rounds.length) : ""}
      ${rounds.length ? `<p>You both cooperated in ${both} of ${rounds.length} rounds.${rounds.length >= m.round_min && m.status === "done" ? ` The match was set to end after round ${rounds.length}, which neither of you knew.` : ""}</p>` : ""}
      ${lookalike(rounds)}
      <div class="btn-row"><a class="btn btn-lapis" href="#/online">Play again</a><a class="btn btn-quiet" href="#/me">Your emblem</a></div>
    </div>`;
    app.querySelector("#status").textContent = "";
  }

  async function refresh(row) {
    if (!row || closed) return;
    const changed = row.current_round !== m.current_round || row.status !== m.status;
    m = { ...m, ...row };
    if (!changed) return drawControls();
    const before = rounds.length;
    await loadMoves();
    if (rounds.length > before) {
      const last = rounds[rounds.length - 1];
      pic?.react(last.me);
      audio.reveal(last.me, last.them);
      app.querySelector("#status").textContent = `${last.slip ? `Your hand slipped: you meant to ${MOVE_VERB[last.me === "C" ? "D" : "C"]}. ` : ""}You ${MOVE_WORD[last.me]}. ${nameOf(other())} ${MOVE_WORD[last.them]}.`;
    }
    if (m.status === "done") audio.finish(grade(totals(rounds)[0], rounds.length) !== "starved");
    draw(before);
  }

  async function play(move) {
    if (myPending || m.status !== "active") return;
    myPending = move;
    audio.tick();
    draw();
    try {
      await net.submitMove(id, move);
      refresh(await net.match(id));
    } catch (err) {
      myPending = null;
      draw();
      app.querySelector("#status").textContent = /already moved/.test(err.message) ? "You've already moved this round." : err.message;
    }
  }

  async function onClick(e) {
    const mv = e.target.closest("[data-move]");
    if (mv && !mv.disabled) return play(mv.dataset.move);
    const act = e.target.closest("[data-act]")?.dataset.act;
    try {
      if (act === "leave") {
        if (!leaving) { leaving = true; return drawControls(); }
        await net.forfeit(id);
        refresh(await net.match(id));
      } else if (act === "claim") {
        await net.claimAbandoned(id);
        refresh(await net.match(id));
      }
    } catch (err) {
      app.querySelector("#status").textContent = err.message;
    }
  }
  function onKey(e) {
    if (e.target.matches?.("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if ((k === "C" || k === "D") && m?.status === "active") play(k);
  }
  app.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  start().catch((e) => { app.innerHTML = `<div class="screen"><section class="leaf"><p class="notice error">${esc(e.message)}</p></section></div>`; });

  return () => {
    closed = true;
    clearInterval(poll);
    clearInterval(idleTimer);
    stopWatch?.();
    pic?.dispose();
    app.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
}

// ---------------------------------------------------------------- profile

// Reputation as the server keeps it: how often this player cooperated against people.
const trustText = (p) => (p?.trust_rounds
  ? `Cooperated in ${Math.round(p.trust * 100)}% of ${p.trust_rounds} rounds against people`
  : "Hasn't finished a match against a person yet");

function soloRounds(g) {
  return [...g.my_moves].map((mv, i) => ({ me: mv.toUpperCase(), them: g.their_moves[i], slip: mv !== mv.toUpperCase() }));
}

function onlineRounds(row, uid) {
  const byRound = {};
  row.moves.forEach((x) => ((byRound[x.round] ??= {})[x.seat] = x.move));
  const slipped = new Set((row.slips || []).map((x) => x.round));
  const done = Object.keys(byRound).map(Number).sort((a, b) => a - b).filter((r) => byRound[r].a && byRound[r].b);
  return fromSide(done.map((r) => byRound[r]), row.player_a === uid).map((x, i) => ({ ...x, slip: slipped.has(done[i]) }));
}

function profile() {
  setTitle("Your emblem");
  if (!auth.user) {
    app.innerHTML = `<div class="screen cols two"><section class="leaf framed stack"><h1>Your emblem</h1>
      ${signInBlock("Your emblem is drawn from every round you play. Sign in with Google to keep a record, online and against the characters.")}</section></div>`;
    bindSignIn(app);
    return () => {};
  }
  app.innerHTML = `<div class="screen"><section class="leaf"><p class="waiting">Reading your record</p></section></div>`;
  let pic = null, closed = false;
  const uid = auth.user.id;

  (async () => {
    const { online, solo } = await net.history();
    const oppIds = [...new Set(online.map((r) => (r.player_a === uid ? r.player_b : r.player_a)).filter(Boolean))];
    const people = Object.fromEntries((await net.profiles(oppIds)).map((p) => [p.id, p]));
    if (closed) return;
    const games = [
      ...online.map((r) => ({ kind: "online", row: r, when: r.finished_at || r.created_at, rounds: onlineRounds(r, uid) })),
      ...solo.map((g) => ({ kind: "solo", row: g, when: g.created_at, rounds: soloRounds(g) }))
    ].sort((a, b) => new Date(b.when) - new Date(a.when));
    const fp = fingerprint(games.map((g) => g.rounds));
    const top = fp.top[0];
    const name = auth.profile?.display_name || "You";

    const summary = { top: fp.scores.slice(0, 3).map(({ key, pct }) => ({ key, pct })), enough: fp.enough, rounds: fp.rounds };
    const cached = auth.profile?.fingerprint || {};
    if (JSON.stringify(cached) !== JSON.stringify(summary) || auth.profile?.games_played !== games.length) {
      net.updateProfile(uid, { fingerprint: summary, coop_rate: fp.coopRate, games_played: games.length })
        .then(() => auth.profile && Object.assign(auth.profile, { fingerprint: summary, games_played: games.length })).catch(() => {});
    }

    const reading = !games.length
      ? `<p class="verse">No rounds yet. Play a character or a person and your emblem starts to form.</p>`
      : fp.enough
        ? `<p class="verse">You play most like ${esc(byKey[top.key].name)}${fp.top.length > 1 ? `, with ${fp.top.slice(1, 3).map((t) => esc(t.name)).join(" and ")} close behind` : ""}.</p>`
        : `<p class="verse">Not enough evidence yet. ${fp.rounds} of the ${MIN_ROUNDS} telling rounds it takes to read you.</p>`;
    const emblemKey = fp.enough ? top.key : "device";

    const item = (g) => {
      const [a, b] = totals(g.rounds);
      let who, res;
      if (g.kind === "solo") {
        who = `<a href="#/c/${g.row.strategy}">${esc(byKey[g.row.strategy]?.name || g.row.strategy)}</a>`;
        res = `${a} to ${b}`;
      } else {
        const opp = g.row.player_a === uid ? g.row.player_b : g.row.player_a;
        who = opp ? `<a href="#/p/${opp}">${esc(people[opp]?.display_name || "A player")}</a>` : "A player who left";
        const mySeat = g.row.player_a === uid ? "a" : "b";
        res = g.row.status === "abandoned" ? (g.row.abandoned_by === mySeat ? "You left" : "They left") : `${a} to ${b}`;
      }
      const date = new Date(g.when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      return `<li><div>${who} <span class="when">${g.kind === "online" ? "online" : "character"}, ${date}</span></div>
        <div class="res num">${res}</div>${recordHTML(g.rounds, "You", "Them", { mini: true })}</li>`;
    };

    app.innerHTML = `<div class="screen stack">
      <div class="spread">
        <section class="leaf framed emblem" aria-label="Your emblem">
          <p class="motto">${esc(byKey[emblemKey]?.motto || "Two hands, one choice")}</p>
          <div class="picture" id="pic"></div>
          <h2>${esc(name)}</h2>
          ${reading}
        </section>
        <section class="leaf stack">
          <dl class="stats">
            <div><dt>Games</dt><dd>${games.length}</dd></div>
            <div><dt>Rounds</dt><dd>${fp.played}</dd></div>
            <div><dt>Cooperated</dt><dd>${Math.round(fp.coopRate * 100)}%</dd></div>
          </dl>
          <h2>Index of characters</h2>
          <p class="soft">How likely each character was to make the moves you made. <a href="#/ideas/reading">How this is worked out</a>.</p>
          <ol class="index-list${fp.enough ? "" : " soft"}">${fp.scores.map((s, i) => `<li class="${i === 0 && fp.enough ? "top" : ""}">
            <a href="#/c/${s.key}">${esc(s.name)}</a><span class="dots"></span><span class="num">${s.pct}%</span>
            <span class="bar"><i style="width:${s.pct}%"></i></span></li>`).join("")}</ol>
        </section>
      </div>
      <section class="leaf stack">
        <h2>The register</h2>
        ${games.length ? `<ol class="register">${games.slice(0, 40).map(item).join("")}</ol>` : `<p>Your games will be listed here.</p>`}
        ${ornament}
        <div class="btn-row"><button class="btn btn-quiet" data-act="signout">Sign out</button>
          <a class="btn btn-quiet" href="delete-account.html">Delete my account</a></div>
      </section>
    </div>`;
    livePicture(app.querySelector("#pic"), emblemKey, "Woodcut picture of your emblem").then((p) => (pic = p));
    app.querySelector('[data-act="signout"]').addEventListener("click", async () => { await net.signOut(); location.hash = "#/"; });
  })().catch((e) => {
    app.innerHTML = `<div class="screen"><section class="leaf"><p class="notice error">Couldn't read your record: ${esc(e.message)}</p></section></div>`;
  });
  return () => { closed = true; pic?.dispose(); };
}

function otherProfile(id) {
  if (!auth.user) return profile();
  if (id === auth.user.id) { location.replace("#/me"); return () => {}; }
  setTitle("Player");
  let pic = null;
  app.innerHTML = `<div class="screen"><section class="leaf"><p class="waiting">Looking them up</p></section></div>`;
  net.profiles([id]).then(([p]) => {
    if (!p) { app.innerHTML = `<div class="screen"><section class="leaf"><h1>No such player</h1></section></div>`; return; }
    const f = p.fingerprint || {};
    const top = f.enough && f.top?.[0] && byKey[f.top[0].key] ? f.top[0] : null;
    app.innerHTML = `<div class="screen spread">
      <section class="leaf framed emblem"><p class="motto">${esc(top ? byKey[top.key].motto : "Two hands, one choice")}</p>
        <div class="picture" id="pic"></div><h2>${esc(p.display_name)}</h2>
        <p class="verse center">${top ? `Plays most like ${esc(byKey[top.key].name)} (${top.pct}%)` : "Not enough games yet to say how they play."}</p></section>
      <section class="leaf stack"><dl class="stats">
        <div><dt>Games</dt><dd>${p.games_played}</dd></div>
        <div><dt>With people</dt><dd>${p.trust_rounds ? Math.round(p.trust * 100) + "% cooperated" : "No matches yet"}</dd></div></dl>
        ${top ? `<ol class="ranking">${f.top.map((t) => `<li><a href="#/c/${t.key}">${esc(byKey[t.key]?.name)}</a><span class="num">${t.pct}%</span></li>`).join("")}</ol>` : ""}
        <p class="soft">Each player's history stays private. Others see only this summary.</p>
        <p><a class="btn" href="#/online">Play someone</a></p></section></div>`;
    livePicture(app.querySelector("#pic"), top ? top.key : "device", `Woodcut picture for ${p.display_name}`).then((x) => (pic = x));
  }).catch((e) => { app.innerHTML = `<div class="screen"><section class="leaf"><p class="notice error">${esc(e.message)}</p></section></div>`; });
  return () => pic?.dispose();
}

// ---------------------------------------------------------------- ideas and rules

function ideas() {
  setTitle("Ideas");
  app.innerHTML = `<div class="screen stack">
    <div><h1 class="page-title">The Ideas</h1><p class="on-cloth">Short chapters on why cooperation is hard, and how it happens anyway.</p></div>
    <div class="essay-list">${IDEAS.map((x) => `<a class="leaf" href="#/ideas/${x.key}"><h2>${esc(x.title)}</h2><p class="motto">${esc(x.motto)}</p></a>`).join("")}</div>
  </div>`;
  return () => {};
}

function essay(key) {
  const i = IDEAS.findIndex((x) => x.key === key);
  if (i < 0) return notFound();
  const x = IDEAS[i], prev = IDEAS[i - 1], next = IDEAS[i + 1];
  setTitle(x.title);
  app.innerHTML = `<div class="screen"><article class="leaf framed essay prose" style="margin:0 auto">
    <h1>${esc(x.title)}</h1>
    <p class="motto">${esc(x.motto)}</p>
    ${ornament}
    ${x.body.map((p) => `<p>${esc(p)}</p>`).join("")}
    <nav class="essay-nav" aria-label="Chapters">
      ${prev ? `<a href="#/ideas/${prev.key}">Back: ${esc(prev.title)}</a>` : `<a href="#/ideas">All chapters</a>`}
      ${next ? `<a href="#/ideas/${next.key}">Next: ${esc(next.title)}</a>` : `<a href="#/characters">Play a character</a>`}
    </nav>
  </article></div>`;
  return () => {};
}

function rules() {
  setTitle("Rules");
  app.innerHTML = `<div class="screen"><article class="leaf framed prose" style="margin:0 auto">
    <h1>The Rules</h1>
    ${ornament}
    <p>Each round, both players choose at the same time: cooperate or defect. Neither sees the other's choice until both are in. Then the points are handed out.</p>
    <table class="payoff">
      <caption class="visually-hidden">Points per round: yours first, theirs second</caption>
      <tr><th></th><th scope="col">They cooperate</th><th scope="col">They defect</th></tr>
      <tr><th scope="row">You cooperate</th><td class="cc"><b>3 / 3</b><small>reward</small></td><td><b>0 / 5</b><small>you're the sucker</small></td></tr>
      <tr><th scope="row">You defect</th><td><b>5 / 0</b><small>temptation</small></td><td class="dd"><b>1 / 1</b><small>both punished</small></td></tr>
    </table>
    <p>Defecting always pays more in a single round. Cooperating pays more over many rounds, if the other player cooperates too. That tension is the whole game.</p>
    <h2>How a match is judged</h2>
    <p>Not by who scored more. Defect first and you can never lose a match head to head, so that question says nothing. A match is judged against the table: 3 points a round is what steady cooperation pays both players.</p>
    <ul>
      <li><b>Prospered</b>: 2.5 points a round or more.</li>
      <li><b>Got by</b>: 1.5 to 2.5.</li>
      <li><b>Starved</b>: under 1.5. Two players who keep punishing each other end up here, whoever is ahead.</li>
    </ul>
    <p>Both players can prosper. Both can starve. For a real contest, run <a href="#/gauntlet">the gauntlet</a>: five characters, one total, ranked against all 25.</p>
    <h2>How long a match runs</h2>
    <p>You're told a range, like 10 to 16 rounds. The real length is drawn in secret and you find out when the match stops. If you knew the last round you'd be tempted to defect on it, and then on the one before. The chapter on <a href="#/ideas/shadow">the shadow of the future</a> explains why.</p>
    <h2>Playing a person</h2>
    <p>Before the match you see how often your opponent has cooperated against people, counted by the server from every move they've made. Your own number travels with you the same way.</p>
    <p>Your move is sealed on the server the moment you choose. Your opponent can't see it, and nor can anyone reading the network traffic, until they have chosen as well. If someone goes silent for three minutes after you've moved, you can end the match and take the win. Leaving a match counts as a loss.</p>
    <h2>Shaky hands</h2>
    <p>Turn it on and 1 move in 20 comes out the other way, for both players. You're told when your own hand slips. Nobody is told when theirs did, so a defection might be a mistake. Whether to forgive it is up to you. Slipped moves don't count toward your emblem. See <a href="#/ideas/noise">noise and forgiveness</a>.</p>
    <h2>Keys</h2>
    <p><kbd>C</kbd> to cooperate and <kbd>D</kbd> to defect, on any match page.</p>
    <p><a class="btn btn-lapis" href="#/characters">Choose a character</a></p>
  </article></div>`;
  return () => {};
}

function notFound() {
  setTitle("Not found");
  app.innerHTML = `<div class="screen"><section class="leaf framed stack"><h1>This page isn't in the book</h1><p><a class="btn" href="#/">Back to the title page</a></p></section></div>`;
  return () => {};
}

// ---------------------------------------------------------------- routing and auth

function route() {
  cleanup();
  const path = location.hash.replace(/^#\/?/, "");
  const [a, b] = path.split("/");
  markNav(path);
  const table = {
    "": () => home(),
    characters: () => catalog(),
    c: () => character(b),
    play: () => solo(b),
    gauntlet: () => gauntlet(),
    online: () => lobby(),
    join: () => joinCode(b),
    m: () => match(b),
    me: () => profile(),
    p: () => otherProfile(b),
    ideas: () => (b ? essay(b) : ideas()),
    rules: () => rules()
  };
  cleanup = (table[a] || notFound)() || (() => {});
  if (document.activeElement && document.activeElement !== document.body) app.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function drawAuth() {
  const slot = document.getElementById("auth-slot");
  if (!net.configured()) { slot.innerHTML = ""; return; }
  if (auth.user) {
    const p = auth.profile;
    slot.innerHTML = `<a href="#/me">${esc(p?.display_name || "Your emblem")}</a>`;
  } else {
    slot.innerHTML = `<button type="button" class="link-btn" data-act="signin">Sign in</button>`;
    bindSignIn(slot);
  }
}

async function setSession(s) {
  const was = auth.user?.id;
  auth.session = s;
  auth.user = s?.user || null;
  auth.profile = auth.user ? (await net.profiles([auth.user.id]).catch(() => []))[0] || null : null;
  drawAuth();
  if (was !== auth.user?.id) {
    let back = null;
    try { back = sessionStorage.getItem("pd.returnTo"); sessionStorage.removeItem("pd.returnTo"); } catch (e) {}
    if (back && auth.user && back !== location.hash) location.hash = back;
    else route();
  }
}

function soundButton() {
  const b = document.getElementById("sound-toggle");
  const sync = () => (b.textContent = audio.soundOn() ? "Turn sound off" : "Turn sound on");
  b.addEventListener("click", () => { audio.setSound(!audio.soundOn()); sync(); });
  sync();
}

soundButton();
window.addEventListener("hashchange", route);
route();
if (net.configured()) {
  net.session().then(setSession).catch(() => {});
  net.onAuth((s) => { if ((s?.user?.id || null) !== (auth.user?.id || null)) setSession(s); });
}
