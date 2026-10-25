// The ideas behind the game. Each essay is a list of paragraphs; plain text only.

export const IDEAS = [
  {
    key: "prisoners",
    title: "Two prisoners",
    motto: "Where the name comes from",
    body: [
      "In 1950 two mathematicians at the RAND Corporation, Merrill Flood and Melvin Dresher, ran a small experiment with a game where each player did better by betraying the other, yet both did worse when both betrayed. Albert Tucker heard about it and, to explain it to a room of psychologists, told it as a story about two prisoners. The story stuck and gave the game its name.",
      "Two people are arrested and questioned in separate rooms. If both stay quiet, both get a short sentence. If one talks and the other stays quiet, the talker walks free and the quiet one gets the long sentence. If both talk, both get a fairly long one.",
      "In this game the sentences are turned into points. Both cooperate: 3 each. One defects on a cooperator: 5 for the defector, 0 for the other. Both defect: 1 each."
    ]
  },
  {
    key: "dominance",
    title: "Why defecting looks smart",
    motto: "The trap in the table",
    body: [
      "Look at the table from one side only. If the other player cooperates, defecting gets you 5 instead of 3. If they defect, defecting gets you 1 instead of 0. Whatever they do, you score more by defecting. Game theorists call that a dominant strategy.",
      "The other player can do the same sum. So two careful, selfish players both defect and both get 1, when they could each have had 3. Mutual defection is the game's only Nash equilibrium, named after John Nash: neither player can do better by changing their own move alone.",
      "That is the whole puzzle. Each person reasons well, and together they end up worse off. Every idea on these pages is an attempt to get out of that hole."
    ]
  },
  {
    key: "hobbes",
    title: "Hobbes and the war of all against all",
    motto: "Nasty, brutish, and short",
    body: [
      "Thomas Hobbes wrote Leviathan in 1651, after years of civil war in England. He asked what life would be like with no government at all. His answer: everyone would have to fear everyone, nobody would plant a crop they might not get to harvest, and life would be solitary, poor, nasty, brutish, and short.",
      "His way out was a sovereign strong enough to punish people who break agreements. With a judge watching, keeping your word becomes the safe move.",
      "There is no sovereign in this game. Nobody punishes a defection except the other player, in the next round. Whether that is enough is the question the rest of the game tests."
    ]
  },
  {
    key: "rousseau",
    title: "Rousseau's stag hunt",
    motto: "A stag for two, or a hare for one",
    body: [
      "In 1755 Jean-Jacques Rousseau described a group of hunters waiting for a stag. Together they can catch it and everyone eats well. But if a hare runs past one hunter, he may grab it and leave his post, and the stag gets away.",
      "This is a different game from the prisoner's dilemma, and the difference matters. In the stag hunt, cooperating is the best move as long as you trust the others to stay. The only reason to leave is fear that someone else will leave first. In the prisoner's dilemma, defecting pays more whatever the other person does.",
      "Repeating the prisoner's dilemma turns it into something closer to the stag hunt. Once there is a next round, trust can pay, and the main danger becomes doubt about the other player."
    ]
  },
  {
    key: "kant",
    title: "Kant's question",
    motto: "What if everyone did that?",
    body: [
      "Immanuel Kant argued that you should act only on a rule you could want everyone to follow. He called it the categorical imperative. Lying fails the test: if everyone lied, nobody would believe anyone and lying would stop working.",
      "Kant never wrote about this game, but his question cuts straight through it. If everyone followed the rule \"defect, it pays more\", everyone would score 1. If everyone followed \"cooperate\", everyone would score 3. The rule that wins for one person loses for all.",
      "The table rewards the defector anyway. That gap between what is right as a rule and what pays as a single move is why the game still gets argued about."
    ]
  },
  {
    key: "shadow",
    title: "The shadow of the future",
    motto: "Why you never know the last round",
    body: [
      "Robert Axelrod used the phrase \"the shadow of the future\" for the weight the next round carries. If you will meet someone again, cheating them today has a cost tomorrow.",
      "But suppose both players know exactly when the game ends. On the last round there is no tomorrow, so both should defect. Then the second-to-last round is effectively the last one that matters, so both should defect there too. Follow that logic back and it reaches round one. This is called backward induction, and it says a game of known length unravels completely.",
      "That is why online matches here never tell you the true length. You see a range, like 10 to 16 rounds, and the server keeps the real number to itself. Every round might be followed by another, so the shadow never lifts."
    ]
  },
  {
    key: "axelrod",
    title: "Axelrod's tournaments",
    motto: "Four lines of code beat everyone",
    body: [
      "In 1980 the political scientist Robert Axelrod invited game theorists to send in computer programs to play the repeated prisoner's dilemma against each other. Fourteen entries came in, and he added one that played at random. The winner was Tit for Tat, sent in by Anatol Rapoport. It was the shortest program in the field.",
      "Axelrod published the results and ran a second tournament. This time 62 entries came in from people who had seen the first results, some of them built to beat Tit for Tat, and games ended at random points so nobody could plan for a final round. Tit for Tat won again.",
      "From the results Axelrod drew a few lessons. The strategies that did well were nice, meaning never the first to defect. They hit back when defected on, they forgave once the other side came back, and they were simple enough for opponents to read. He wrote it all up in The Evolution of Cooperation in 1984.",
      "Notice what Tit for Tat never did: beat anyone. It can't score more than the player in front of it, because it never defects first. It won on the total. The gauntlet here works the same way. Five opponents, one sum, and the players who win single matches by striking first tend to finish low."
    ]
  },
  {
    key: "noise",
    title: "Noise and forgiveness",
    motto: "One slip, and the echo",
    body: [
      "Put two Tit for Tat players together and they cooperate forever. Now let one of them make a single mistake. The other copies the defection, the first copies that back, and the two of them trade blows for the rest of the game. A pure mirror has no way to stop an echo.",
      "In 1992 Martin Nowak and Karl Sigmund found that a forgiving version, Generous Tit for Tat, does better when mistakes happen. It sometimes lets a defection go, which ends the echo. In 1993 they showed that Pavlov, which repeats a move that paid and switches after one that didn't, can beat Tit for Tat in a noisy world too.",
      "Real relationships are noisy. Messages get misread, people have bad days. Some forgiveness is part of what makes cooperation last.",
      "Turn on shaky hands and you play in that world. One move in twenty comes out the other way. You're told when your own hand slips, never when theirs did, so every defection against you raises the same question: was that meant?"
    ]
  },
  {
    key: "superrational",
    title: "Superrationality",
    motto: "If you think like me",
    body: [
      "In 1983 Douglas Hofstadter wrote in Scientific American about a different way to reason. Suppose both players are equally rational and each knows it. Then whatever one of them concludes, the other will conclude too. The only real choice is between both cooperating and both defecting, and 3 beats 1. So a truly rational player cooperates.",
      "Hofstadter called this superrationality. He ran the game with a group of friends by letter and was disappointed when most of them defected.",
      "Most game theorists reject the argument, since your choice cannot cause the other person's. It still describes something people feel when they play: the sense that the person across the table is working through the same thoughts."
    ]
  },
  {
    key: "reading",
    title: "How your emblem is read",
    motto: "What the percentages mean",
    body: [
      "Every round you play is saved with what came before it. To build your profile, the game goes back through those rounds and asks each of the 25 characters a question: given this exact history, how likely were you to make the move this player made?",
      "A character that would always have done what you did scores close to 100%. Fixed-rule characters are allowed a small chance of slipping, so one odd move lowers a score without wiping it out. The number shown is the typical chance per round, worked out as a geometric mean.",
      "Rounds where all 25 characters would have agreed, and you agreed with them, are skipped, because they tell nothing apart. Below 20 telling rounds the profile says there isn't enough evidence yet. A player who looks like a coin flip will find Random at the top, at 50%, because nothing else predicts them better.",
      "Moves that slipped under shaky hands are left out. They weren't your choice, so they say nothing about how you play. The history around them still counts, since the characters would have seen the slip and answered it."
    ]
  }
];
