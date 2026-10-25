# Prisoner's Dilemma

An emblem book of trust and betrayal, in twenty-five characters.

Play the repeated prisoner's dilemma against 25 strategies from game theory, or against a friend online with chat. Every round you play feeds your profile, which tells you which character you play most like.

Live at [tanim913.github.io/prisoners_dilemma](https://tanim913.github.io/prisoners_dilemma/).

## What's in it

- **25 characters.** Tit for Tat, Grim Trigger, Pavlov, Gradual and the rest. Each has a motto, a rule, a short verse in its own voice, a note on where it comes from, and a live woodcut picture drawn with three.js.
- **Solo play.** No sign-in needed. At the end you see how every character would have scored against the same opponent, and which one you played like.
- **Online play.** Invite a friend with a six-letter code or link, or wait in a public queue for a stranger. Chat in the margin while you play.
- **A hidden end.** You're told a range, like 10 to 16 rounds. The real length stays secret, so there is no last round to defect on.
- **Judged against the table.** A match ends with Prospered, Got by or Starved, set by points per round. Striking first can win a match and still starve both players.
- **The gauntlet.** Five random characters in a row, one total, ranked against what all 25 characters would score against the same five.
- **Shaky hands.** An option where 1 move in 20 comes out the other way. You're told about your own slips, never theirs.
- **Reputation.** Before an online match you see how often your opponent has cooperated against people. The server counts it, so it can't be edited.
- **Your emblem.** A profile with your record, your cooperation rate, and how likely each of the 25 characters was to make the moves you made.
- **The ideas.** Ten short chapters: Hobbes, Rousseau's stag hunt, Kant, Axelrod's tournaments, the shadow of the future, noise and forgiveness, superrationality.

## Points per round

|  | They cooperate | They defect |
|--|:--:|:--:|
| **You cooperate** | 3 / 3 | 0 / 5 |
| **You defect** | 5 / 0 | 1 / 1 |

## How fair play works

Both moves of a round are stored on the server, and a player can only read the other's move once both are in. Scores, the round counter and the secret match length are handled by Postgres functions, never by the browser. The rules are enforced with Row Level Security; `tests/rls-test.sql` checks them.

## Run it locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Solo play works straight away. Online play needs a Supabase project (see `docs/BACKEND.md`) with its URL and publishable key in `config.js`.

## Tests

```bash
npm test          # strategy behavior, the fingerprint, and the text check (no dashes, no stock phrasing)
```

The database test runs inside a transaction that rolls back. Against a local Postgres 16:

```bash
psql -d game -f tests/local-stub.sql
psql -d game -f supabase/migrations/20261025000000_init.sql
psql -d game -f supabase/migrations/20261025120000_harder.sql
psql -d game -f tests/rls-test.sql
```

On the real project, paste `tests/rls-test.sql` into the SQL editor.

## Layout

```
index.html                 the page shell
css/app.css                the emblem book look
js/app.js                  screens, routing, solo and online play
js/strategies.js           the 25 characters and their text
js/fingerprint.js          how your emblem is worked out
js/woodcut.js              three.js woodcut pictures
js/ideas.js                the chapters
js/net.js                  everything that talks to Supabase
supabase/migrations/       the database schema and rules
privacy.html, delete-account.html
```

## Credits

© 2026 [Azizullah Tanim](https://github.com/tanim913/). All rights reserved.
