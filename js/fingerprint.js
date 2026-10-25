// How much a player plays like each character.
// For every round a player has played, ask each character how likely it was to make the move the
// player made, given the same history. A character's score is the geometric mean of those chances.
// Deterministic characters are allowed a 2% slip, so one odd move lowers a score without zeroing it.
// Rounds where every character would agree, and the player agreed too, say nothing and are skipped.
// A move that slipped (shaky hands) wasn't the player's choice, so it is skipped too, but stays in the history.
import { STRATEGIES } from "./strategies.js";

const SLIP = 0.04;
export const MIN_ROUNDS = 20;

// games: arrays of { me, them, slip? } from the player's side, in round order.
export function fingerprint(games, strategies = STRATEGIES) {
  const logSum = new Array(strategies.length).fill(0);
  let rounds = 0, played = 0, coop = 0;

  for (const game of games) {
    for (let i = 0; i < game.length; i++) {
      if (game[i].slip) continue;
      const prefix = game.slice(0, i);
      const move = game[i].me;
      played++;
      if (move === "C") coop++;
      const ps = strategies.map((s) => s.p(prefix));

      const leans = new Set(ps.filter((p) => p !== 0.5).map((p) => (p > 0.5 ? "C" : "D")));
      if (leans.size === 1 && leans.has(move)) continue;
      rounds++;

      ps.forEach((p, k) => {
        const chance = move === "C" ? p : 1 - p;
        logSum[k] += Math.log(SLIP / 2 + (1 - SLIP) * chance);
      });
    }
  }

  const scores = strategies
    .map((s, k) => ({ key: s.key, name: s.name, pct: rounds ? Math.round(100 * Math.exp(logSum[k] / rounds)) : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const top = scores.filter((x) => x.pct >= scores[0].pct - 1);

  return {
    scores,
    top,
    rounds,
    played,
    coopRate: played ? coop / played : 0,
    enough: rounds >= MIN_ROUNDS
  };
}

// Flip a match record into the player's side. moves: [{ a, b }], youAreA: boolean.
export function fromSide(moves, youAreA) {
  return moves.map((m) => (youAreA ? { me: m.a, them: m.b } : { me: m.b, them: m.a }));
}
