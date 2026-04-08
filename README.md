# Prisoner’s Dilemma — CLASSIFIED

A single-file, static **iterated Prisoner’s Dilemma** you can open in a browser or host anywhere (e.g. [GitHub Pages](https://pages.github.com/)). You play against classic and experimental **computer strategies** with a Cold War–inspired UI, round heatmap, and optional session resume.

## Play

- Open [`index.html`](index.html) in a browser, **or** serve the folder locally:

  ```bash
  cd prisoners_dilemma_webapp
  python3 -m http.server 8080
  ```

  Then visit `http://localhost:8080`.

- **Deploy**: Put this folder (or repo root) on any static host; the entry point is `index.html`.

## Payoff matrix (per round)

|  | Opponent **C** | Opponent **D** |
|--|:--:|:--:|
| **You C** | 3 / 3 | 0 / 5 |
| **You D** | 5 / 0 | 1 / 1 |

*C* = Cooperate, *D* = Defect. First number is your points, second is the opponent’s (temptation **5** > reward **3** > punishment **1** > sucker **0**).

## Features

- **25 strategies** (including one pure random) with short rules, dossier quotes, and portraits.
- **6–200 rounds, even counts only** (slider directly under the title row on the setup screen, inside a **sticky** top bar with **BRIEFING** so rounds and rules stay reachable while scrolling the card list).
- **Heatmap**, **round log**, cooperation rates, and clear outcome / verdict copy.
- **Keyboard**: `C` cooperate, `D` defect (when the game is focused).
- **Session resume**: progress is stored in `sessionStorage` under `prisonersDilemmaSession` (same tab/origin); reload may prompt to continue.
- **Comparison modal**: see how other strategies would have scored against the **same** opponent moves in your match.
- **Field briefing**: narrative rules and payoff table (**BRIEFING** control, top right on the setup screen).
- **Sound**: short Web Audio cues for round tension and outcomes; **AUDIO ON** / **AUDIO OFF** on the play bar; **ENABLE AUDIO** on the briefing page (unlocks the browser audio context). Mute preference is stored in `localStorage` (`prisonersDilemmaSoundMuted`). If the system requests reduced motion, audio starts muted until you turn it on.
- **Mobile / desktop**: after you select a strategy, **BEGIN INTERROGATION** appears **under that card** only (no separate bottom bar). On phones the play-screen dossier portrait stack is **more compact** to free vertical space.
- **Random** strategy uses a fair 50/50 choice per round (`crypto.getRandomValues` when available).

## Strategies

| Strategy | Style |
|----------|--------|
| Tit for Tat | Nice — mirror last move after cooperating first |
| Tit for Two Tats | Nice — defect only after two defections in a row |
| Generous Tit for Tat | Nice — TFT with occasional forgiveness |
| Always Cooperate | Nice |
| Always Defect | Nasty |
| Friedman (Grim Trigger) | Nice — cooperates until you defect once, then always defects |
| Joss | Nasty — opens with defect, then mostly TFT with occasional surprise defect |
| Graaskamp | Nasty — opens hostile, then TFT with a forced probe defection on round 50 |
| Tester | Nasty — probes on round one, then adapts |
| Pavlov | Nice — win-stay, lose-shift |
| Gradual | Nice — escalates punishment, then cools off |
| Soft Majority | Nice — cooperates if you’ve cooperated ≥ half the time |
| Hard Majority | Nasty — cooperates only if you cooperate *more* than half the time |
| Naive Prober | Nasty — opens hostile, then mostly TFT with random probing defections |
| Cold Open | Nasty — defect first, then Tit for Tat |
| Bunker | Nasty — defects first two rounds, then mirrors last move |
| Hungry Majority | Nasty — defect first; coop only if ≥3 of your last 5 moves were cooperate |
| Steel Gate | Nasty — defect first; then Hard Majority style |
| Spite Echo | Nasty — defects until you defect once; then TFT |
| Shock Prober | Nasty — defect first; TFT with random probes |
| Warm Opening | Nice — cooperate first three rounds, then TFT |
| Olive Branch | Nice — TFT with auto-cooperate after mutual defection |
| Slow Counter | Nice — cooperate until two of your defections pile up; then TFT |
| Guardian | Nice — TFT with stability bonus after two cooperations in a row |
| Random | Chaos — 50/50 each round, no memory |

## Tech stack

- Vanilla **HTML**, **CSS**, and **JavaScript** (no build step); **Web Audio API** for optional UI sounds (no external audio files).
- Fonts: [Syne](https://fonts.google.com/specimen/Syne) and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) via Google Fonts (requires network for first load).

## Repository layout

```
prisoners_dilemma_webapp/
├── index.html    # Full app (markup, styles, logic)
└── README.md
```

## Credits

© 2026 [Azizullah Tanim](https://github.com/tanim913/). All rights reserved.

## License

If you publish the repo, add a `LICENSE` file with your preferred terms. The app is original UI/logic in this project unless you state otherwise.
