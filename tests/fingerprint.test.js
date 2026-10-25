import { test } from "node:test";
import assert from "node:assert/strict";
import { STRATEGIES, byKey, decide } from "../js/strategies.js";
import { fingerprint, fromSide } from "../js/fingerprint.js";

let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// The player follows `play`; the opponent cooperates with a different random bias each game.
function games(play, n = 8, len = 40) {
  return Array.from({ length: n }, () => {
    const bias = rnd(), h = [];
    for (let i = 0; i < len; i++) h.push({ me: play(h), them: rnd() < bias ? "C" : "D" });
    return h;
  });
}

test("every deterministic character recognizes itself", () => {
  for (const s of STRATEGIES.filter((x) => ![ "gtft", "joss", "prober", "random" ].includes(x.key))) {
    const fp = fingerprint(games((h) => decide(s, h)));
    assert.ok(fp.enough, s.name);
    assert.ok(fp.top.some((t) => t.key === s.key), `${s.name}: top was ${fp.top.map((t) => t.name)}`);
    assert.ok(fp.scores.find((t) => t.key === s.key).pct >= 95, s.name);
  }
});

test("a coin-flipping player looks most like Random", () => {
  const fp = fingerprint(games(() => (rnd() < 0.5 ? "C" : "D")));
  assert.equal(fp.top[0].key, "random");
});

test("Tit for Tat with occasional stabs looks like Joss, not Tit for Tat", () => {
  const fp = fingerprint(games((h) => (byKey.tft.p(h) && rnd() < 0.1 ? "D" : decide(byKey.tft, h)), 12, 50));
  const pct = (k) => fp.scores.find((t) => t.key === k).pct;
  assert.ok(pct("joss") > pct("tft"));
});

test("a few rounds is not enough evidence", () => {
  const fp = fingerprint(games((h) => decide(byKey.tft, h), 1, 5));
  assert.equal(fp.enough, false);
});

test("fromSide flips the record for player B", () => {
  assert.deepEqual(fromSide([{ a: "C", b: "D" }], false), [{ me: "D", them: "C" }]);
});

test("a slipped move doesn't count against the player", () => {
  const g = games((h) => decide(byKey.grim, h), 8, 40);
  const slipped = g.map((h) => h.map((r, i) => (i === 3 ? { ...r, me: r.me === "C" ? "D" : "C", slip: true } : r)));
  const fp = fingerprint(slipped);
  assert.equal(fp.played, 8 * 39);
  assert.ok(fp.top.some((t) => t.key === "grim"), `top was ${fp.top.map((t) => t.name)}`);
});
