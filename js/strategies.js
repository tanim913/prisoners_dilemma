// The 25 characters. Pure module: no DOM, so Node tests and the browser share it.
// Moves are "C" and "D". A history entry is { me, them } from the deciding side's view.
// Each strategy gives p(history) = chance it cooperates next; deterministic ones return 0 or 1.

export const PAYOFF = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };

export function scoreRound(a, b) {
  return PAYOFF[a + b];
}

function rand() {
  if (globalThis.crypto && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  }
  return Math.random();
}

export function decide(strategy, h) {
  const p = strategy.p(h);
  if (p === 1) return "C";
  if (p === 0) return "D";
  return rand() < p ? "C" : "D";
}

const last = (h, k = 1) => h[h.length - k];
const count = (h, m) => h.reduce((n, x) => n + (x.them === m ? 1 : 0), 0);
const tft = (h) => (!h.length || last(h).them === "C" ? 1 : 0);

// Gradual is a state machine; replaying it from the history keeps every strategy stateless.
function gradual(h) {
  let phase = "normal", punish = 0, cool = 0, defects = 0, move = 1;
  for (let i = 0; i <= h.length; i++) {
    if (i > 0 && h[i - 1].them === "D") defects++;
    if (i === 0) { move = 1; continue; }
    if (phase === "cooling") {
      if (--cool === 0) phase = "normal";
      move = 1;
    } else if (phase === "punishing") {
      if (punish > 0) { punish--; move = 0; } else { phase = "cooling"; cool = 2; move = 1; }
    } else if (h[i - 1].them === "D") {
      phase = "punishing"; punish = Math.max(0, defects - 1); move = 0;
    } else {
      move = 1;
    }
  }
  return move;
}

function tester(h) {
  const r = h.length + 1;
  if (r === 1) return 0;
  if (h[0].them === "D") {
    if (r === 2 || r === 3) return 1;
    return tft(h);
  }
  return r % 2 === 0 ? 0 : 1;
}

function pavlov(h) {
  if (!h.length) return 1;
  const l = last(h);
  const paid = scoreRound(l.me, l.them)[0] >= 3;
  const repeat = paid ? l.me : (l.me === "C" ? "D" : "C");
  return repeat === "C" ? 1 : 0;
}

// Opens after three straight cooperations, shuts after two straight defections.
function steelGate(h) {
  let open = false, runC = 0, runD = 0;
  for (const x of h) {
    if (x.them === "C") { runC++; runD = 0; } else { runD++; runC = 0; }
    if (!open && runC >= 3) open = true;
    if (open && runD >= 2) open = false;
  }
  return open ? 1 : 0;
}

// Breaks the peace once after five unbroken rounds of mutual cooperation.
function shockProber(h) {
  if (!h.length) return 0;
  let calm = 0;
  for (const x of h) calm = x.me === "C" && x.them === "C" ? calm + 1 : 0;
  if (calm >= 5) return 0;
  return tft(h);
}

function guardian(h) {
  if (h.length >= 3 && last(h).them === "D") {
    const a = last(h, 2), b = last(h, 3);
    if (a.me === "C" && a.them === "C" && b.me === "C" && b.them === "C") return 1;
  }
  return tft(h);
}

export const STRATEGIES = [
  {
    key: "tft", name: "Tit for Tat", badge: "Nice",
    motto: "Like for like",
    rule: "Opens with cooperation. After that, does whatever you did last round.",
    quote: "I'll go first and I'll be decent about it. After that I give you back your own last move. If you don't like what comes back, look at what you sent.",
    idea: "Won both of Robert Axelrod's computer tournaments in 1980. Anatol Rapoport entered it, and it was the shortest program in the field.",
    after: "Your choices were the whole story. Everything you sent came back one round later.",
    p: tft
  },
  {
    key: "tf2t", name: "Tit for Two Tats", badge: "Nice",
    motto: "Once is weather",
    rule: "Defects only after you defect twice in a row.",
    quote: "I let one bad move go. People have bad days. Two in a row and I stop calling it a bad day.",
    idea: "Axelrod worked out that it would have won his first tournament, had anyone entered it.",
    after: "It shrugged off single defections. Only a pair in a row made it hit back.",
    p: (h) => (h.length >= 2 && last(h).them === "D" && last(h, 2).them === "D" ? 0 : 1)
  },
  {
    key: "gtft", name: "Generous Tit for Tat", badge: "Nice",
    motto: "Mercy keeps the peace",
    rule: "Like Tit for Tat, but lets one defection in ten go unanswered.",
    quote: "I keep score, but I round down. Now and then I let a betrayal pass, because two people punishing each other forever is the worst deal on the table.",
    idea: "Nowak and Sigmund found in 1992 that a little forgiveness keeps a relationship alive when mistakes happen.",
    after: "Some of your defections went unpunished. That is how feuds end before they start.",
    p: (h) => (tft(h) ? 1 : 0.1)
  },
  {
    key: "allc", name: "Always Cooperate", badge: "Nice",
    motto: "First onto the bridge",
    rule: "Cooperates every round, whatever you do.",
    quote: "I'm going to be kind whatever you do. You can call that naive. I'd rather be cheated now and then than turn into someone who cheats first.",
    idea: "Kant would approve of the rule behind it. The payoff table doesn't care about rules.",
    after: "It never hit back. Whatever you took from it, you took because you chose to.",
    p: () => 1
  },
  {
    key: "alld", name: "Always Defect", badge: "Nasty",
    motto: "Trust no hand",
    rule: "Defects every round, whatever you do.",
    quote: "Everyone at this table is looking out for themselves. I'm just the one who says so. Whatever you pick, defecting pays me more. Check the numbers.",
    idea: "In a single round, defecting is the dominant move and mutual defection is the only equilibrium. Hobbes called life without trust solitary, poor, nasty, brutish and short.",
    after: "It never offered anything. The only question was how long you kept offering.",
    p: () => 0
  },
  {
    key: "grim", name: "Grim Trigger", badge: "Nice",
    motto: "Once, and never again",
    rule: "Cooperates until you defect once. Then defects forever.",
    quote: "I'll trust you for as long as you let me. Break it once and we're done. I don't do second chances and I don't explain twice.",
    idea: "James Friedman used this threat in 1971 to show that cooperation can hold up in repeated games.",
    after: "One defection was all it took. Everything after that was already decided.",
    p: (h) => (count(h, "D") ? 0 : 1)
  },
  {
    key: "joss", name: "Joss", badge: "Nasty",
    motto: "Fair, mostly",
    rule: "Tit for Tat that sneaks in a defection one time in ten.",
    quote: "I'm fair with you nine times out of ten. The tenth time I take a little extra, because I can. Most people never notice.",
    idea: "Johann Joss entered it in Axelrod's first tournament. Its small betrayals set off long feuds and it finished well behind Tit for Tat.",
    after: "Mostly fair, with the odd knife. Each one risked a feud you had to decide whether to start.",
    p: (h) => (tft(h) ? 0.9 : 0)
  },
  {
    key: "graaskamp", name: "Graaskamp", badge: "Nasty",
    motto: "Patience, then the test",
    rule: "Defects first, then Tit for Tat, with a test defection on round 50.",
    quote: "I start rough to see what you're made of, then I play you straight. Around round fifty I'll test you once more. Old habit.",
    idea: "Loosely based on Jim Graaskamp's entry in Axelrod's first tournament, which probed its opponent at round fifty.",
    after: "A rough start, then a fair mirror. If you got to round fifty, you met the test.",
    p: (h) => (!h.length || h.length + 1 === 50 ? 0 : tft(h))
  },
  {
    key: "tester", name: "Tester", badge: "Nasty",
    motto: "Strike to learn",
    rule: "Defects first. If you hit back, it apologizes and copies you. If not, it exploits you every other round.",
    quote: "First round I hit you, just to see. Hit back and I'll apologize and we're fine. Don't, and I'll keep taking from you, every other round.",
    idea: "One of the entries in Axelrod's second tournament. It punishes pushovers and makes peace with anyone who stands up for themselves.",
    after: "Your answer to round one decided the whole game.",
    p: tester
  },
  {
    key: "pavlov", name: "Pavlov", badge: "Nice",
    motto: "Keep what pays",
    rule: "Repeats its last move if it paid off. Switches if it didn't.",
    quote: "If it paid, I do it again. If it hurt, I switch. I don't have opinions about you. I keep what works.",
    idea: "Win-stay, lose-shift. Nowak and Sigmund showed in 1993 that it beats Tit for Tat when moves sometimes go wrong.",
    after: "It learned from its own score. Rewards made it stay put, and losses made it switch.",
    p: pavlov
  },
  {
    key: "gradual", name: "Gradual", badge: "Nice",
    motto: "Measure for measure",
    rule: "Punishes your Nth defection with N defections, then offers two rounds of peace.",
    quote: "The first time you cross me, I hit back once. The second time, twice. I keep count, I keep it in proportion, and afterwards I offer peace. Every time.",
    idea: "Designed by Beaufils, Delahaye and Mathieu in 1996. Punishment grows with the offense, then the slate is wiped.",
    after: "Every punishment fit the running total, and every one ended with an offer of peace.",
    p: gradual
  },
  {
    key: "softmaj", name: "Soft Majority", badge: "Nice",
    motto: "The whole record speaks",
    rule: "Cooperates if you have cooperated at least half the time.",
    quote: "I go by your whole record. If you've been decent at least half the time, I'll be decent. Seems fair to me.",
    idea: "Judges the whole history at once, which makes it slow to notice when you change.",
    after: "It watched your overall record. One move rarely moved it.",
    p: (h) => (!h.length || count(h, "C") / h.length >= 0.5 ? 1 : 0)
  },
  {
    key: "hardmaj", name: "Hard Majority", badge: "Nasty",
    motto: "Prove it first",
    rule: "Defects until more than half of your moves are cooperation.",
    quote: "Prove it first. I defect until more than half of what you've done is cooperation. Exactly half doesn't count.",
    idea: "Soft Majority with the benefit of the doubt taken away.",
    after: "It wanted a majority before it would trust you, and it started out assuming the worst.",
    p: (h) => (h.length && count(h, "C") / h.length > 0.5 ? 1 : 0)
  },
  {
    key: "prober", name: "Naive Prober", badge: "Nasty",
    motto: "Poke the sleeper",
    rule: "Defects first, then Tit for Tat with a random defection one time in five.",
    quote: "I start hard, then copy you. Every so often I defect for no reason, to see if you're paying attention. If you aren't, I'll keep doing it.",
    idea: "Probing is how a strategy finds out who it can exploit. Each probe costs some trust.",
    after: "It kept poking at you to see whether you'd answer.",
    p: (h) => (!h.length ? 0 : tft(h) ? 0.8 : 0)
  },
  {
    key: "coldopen", name: "Cold Open", badge: "Nasty",
    motto: "First the blow, then the mirror",
    rule: "Defects first, then plain Tit for Tat.",
    quote: "I hit first so you know I can. After that I'm a mirror, same as Tit for Tat. Whether we get past round one is up to you.",
    idea: "Put it against Tit for Tat and one bad first move gets passed back and forth for the rest of the game.",
    after: "One cold move at the start, then your own moves came back at you.",
    p: (h) => (!h.length ? 0 : tft(h))
  },
  {
    key: "bunker", name: "Bunker", badge: "Nasty",
    motto: "Listen before the door opens",
    rule: "Defects the first two rounds, then copies your last move.",
    quote: "Two rounds with the door shut. I listen. Then I come out and do what you did.",
    idea: "Caution has a price. Against a friendly opponent, both of those closed rounds cost points.",
    after: "Two shut rounds, then a mirror. The opening cost both of you.",
    p: (h) => (h.length < 2 ? 0 : tft(h))
  },
  {
    key: "hungrymaj", name: "Hungry Majority", badge: "Nasty",
    motto: "Five days of memory",
    rule: "Defects first. Cooperates only if you cooperated in three of the last five rounds.",
    quote: "I only look at the last five rounds. Give me three good ones and I'll cooperate. Anything before that, I've already forgotten.",
    idea: "A short memory makes it quick to forgive and just as quick to turn.",
    after: "It only remembered the last five rounds, so older kindness counted for nothing.",
    p: (h) => (h.length && count(h.slice(-5), "C") >= 3 ? 1 : 0)
  },
  {
    key: "steelgate", name: "Steel Gate", badge: "Nasty",
    motto: "Slow to open, quick to close",
    rule: "Opens after three cooperations in a row. Shuts after two defections in a row.",
    quote: "The gate starts closed. Three cooperations in a row and it opens. Two defections in a row and it shuts, and you're back to three.",
    idea: "Trust that takes longer to build than to keep.",
    after: "You had to earn the gate open, and it stayed open until you gave two reasons to shut it.",
    p: steelGate
  },
  {
    key: "spiteecho", name: "Spite Echo", badge: "Nasty",
    motto: "Fight me once",
    rule: "Defects until you defect once. After that, Tit for Tat.",
    quote: "I defect until you defect. Odd rule, I know. I want to see you fight back once before I take you seriously. After that I copy you.",
    idea: "Respect earned through conflict. A pure cooperator never gets a single kind move out of it.",
    after: "Until you fought back it gave you nothing. After that it was a mirror.",
    p: (h) => (count(h, "D") ? tft(h) : 0)
  },
  {
    key: "shockprober", name: "Shock Prober", badge: "Nasty",
    motto: "Test the quiet",
    rule: "Defects first, then Tit for Tat. After five calm rounds in a row, defects once.",
    quote: "I open hard, then mirror you. When it gets too quiet, five calm rounds in a row, I break it once. I don't trust a peace nobody has tested.",
    idea: "It tests the peace on a schedule. Against a mirror, every test gets answered, and the echo costs both sides.",
    after: "Every long calm stretch ended with a test. How you answered set the next stretch.",
    p: shockProber
  },
  {
    key: "warmopen", name: "Warm Opening", badge: "Nice",
    motto: "Three lamps for a stranger",
    rule: "Cooperates the first three rounds no matter what, then Tit for Tat.",
    quote: "Three free rounds, whatever you do. Call it a welcome. From round four you get back what you give.",
    idea: "An early gift that buys information about who you are.",
    after: "It gave three rounds for free. After that you were dealing with a mirror.",
    p: (h) => (h.length < 3 ? 1 : tft(h))
  },
  {
    key: "olive", name: "Olive Branch", badge: "Nice",
    motto: "Someone has to stop",
    rule: "Tit for Tat, but after you both defect it offers cooperation.",
    quote: "When we both defect, I offer peace the next round. Somebody has to stop, and I don't mind going first.",
    idea: "A mirror with one apology built in. It breaks feuds that plain Tit for Tat can't get out of.",
    after: "Every time you both defected, it held out a hand the next round.",
    p: (h) => (h.length && last(h).me === "D" && last(h).them === "D" ? 1 : tft(h))
  },
  {
    key: "slowcounter", name: "Slow Counter", badge: "Nice",
    motto: "Two strikes",
    rule: "Cooperates until you have defected twice in total, then Tit for Tat.",
    quote: "Your first defection I let slide. After your second, counting from the start, the mirror is on for good.",
    idea: "Patience with a fixed budget.",
    after: "It gave you one free mistake. After the second it copied you.",
    p: (h) => (count(h, "D") < 2 ? 1 : tft(h))
  },
  {
    key: "guardian", name: "Guardian", badge: "Nice",
    motto: "Shelter what works",
    rule: "Tit for Tat, but forgives one defection that comes after two good rounds together.",
    quote: "If we've had two good rounds together, I'll forgive one slip. Otherwise I copy you. I like to protect something that's working.",
    idea: "Its forgiveness depends on recent history. It is generous to a working partnership and strict with a stranger.",
    after: "When things were going well it forgave a slip. Otherwise it copied you.",
    p: guardian
  },
  {
    key: "random", name: "Random", badge: "Random",
    motto: "The coin decides",
    rule: "Flips a fair coin every round. No memory.",
    quote: "I flip a coin. Every round, no memory, no plan. You'll find patterns in what I do anyway. People always do.",
    idea: "The control group. A strategy that can't beat a coin isn't much of a strategy.",
    after: "There was nothing to learn. Your score was partly luck.",
    p: () => 0.5
  }
];

export const byKey = Object.fromEntries(STRATEGIES.map((s) => [s.key, s]));
