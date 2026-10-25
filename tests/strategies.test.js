import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRATEGIES, byKey, decide } from "../js/strategies.js";

// Decisions recorded from the original single-file game before the refactor.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/old-decisions.json", import.meta.url)));
const OLD_NAME = { "Friedman (Grim Trigger)": "grim" };
const CHANGED = ["Guardian", "Steel Gate"]; // Guardian was identical to Tit for Tat, Steel Gate to Hard Majority.

test("unchanged strategies play exactly as before", () => {
  for (const [name, games] of Object.entries(fixture.decisions)) {
    if (CHANGED.includes(name)) continue;
    const s = OLD_NAME[name] ? byKey[OLD_NAME[name]] : STRATEGIES.find((x) => x.name === name);
    assert.ok(s, name);
    fixture.games.forEach((opp, g) => {
      const h = [];
      let mine = "";
      for (const them of opp) { const me = decide(s, h); mine += me; h.push({ me, them }); }
      assert.equal(mine, games[g], `${name}, game ${g}`);
    });
  }
});

test("no two deterministic strategies play identically", () => {
  const det = STRATEGIES.filter((s) => fixture.games.every(() => true) && ![ "gtft", "joss", "prober", "random" ].includes(s.key));
  const sig = (s) => fixture.games.map((opp) => {
    const h = [];
    for (const them of opp) h.push({ me: decide(s, h), them });
    return h.map((x) => x.me).join("");
  }).join("|");
  const seen = new Map();
  for (const s of det) {
    const k = sig(s);
    assert.ok(!seen.has(k), `${s.name} plays the same as ${seen.get(k)}`);
    seen.set(k, s.name);
  }
});

test("Guardian forgives one slip after two good rounds", () => {
  const h = [{ me: "C", them: "C" }, { me: "C", them: "C" }, { me: "C", them: "D" }];
  assert.equal(byKey.guardian.p(h), 1);
  assert.equal(byKey.tft.p(h), 0);
});

test("Steel Gate opens on three cooperations and shuts on two defections", () => {
  const run = (moves) => byKey.steelgate.p([...moves].map((them) => ({ me: "C", them })));
  assert.equal(run("CC"), 0);
  assert.equal(run("CCC"), 1);
  assert.equal(run("CCCD"), 1);
  assert.equal(run("CCCDD"), 0);
});
