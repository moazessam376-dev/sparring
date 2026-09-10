# Learning science for retaining system designs and commands

Date: 2026-09-10. Question: how should an adult engineer learn technical system designs (step sequences, mechanisms, exact commands such as Redis `SET NX EX`) so they can be explained in interviews weeks later? Sources are numbered at the end. Where I reached only an abstract or a secondary summary, the text says so.

## Findings

### 1. Retrieval practice beats restudy

Roediger and Karpicke 2006: after reading a passage, rereading beat a recall test at 5 minutes (81% vs 75%), but testing won at 2 days (68% vs 54%, d 0.95) and 1 week (56% vs 42%, d 0.83). The reread group was the most confident [S1]. Karpicke and Blunt 2011: one week after learning a science text, retrieval practice scored 0.67 against 0.45 for concept mapping, d 1.50; students predicted the reverse [S2]. Karpicke and Roediger 2008: of 40 Swahili pairs, items kept in the test rotation after first recall were recalled at about 80% a week later, items dropped from testing at 36% and 33%; restudy after first recall added nothing [S3]. Dunlosky et al. 2013 rate practice testing and distributed practice high utility; interleaving, elaborative interrogation and self-explanation moderate; rereading, highlighting, summarising, keyword mnemonics and imagery low [S4]. Rowland 2014 meta-analysis: g 0.50 for testing over restudy [S5].

### 2. Spacing and scheduling

Cepeda et al. 2006 (839 assessments, 317 experiments): the best gap between study sessions grows with the retention interval [S6]. Cepeda et al. 2008 (1,354 people, gaps to 3.5 months, tests to 1 year): the optimal gap raised recall 64% over a zero gap (d 1.1); for retention intervals of 7, 35, 70 and 350 days the best gaps tested were 1, 11, 21 and 21 days; as a proportion of the retention interval the optimum fell from about 20% at a few weeks to 5% at a year [S7]. Latimier et al. 2021: g 0.74 for spaced over massed retrieval [S8]. Karpicke and Bauernschmidt 2011: total spacing mattered (about 200% gain over no gap) but expanding versus equal schedules did not [S9]. Karpicke and Roediger 2007: expanding won at 10 minutes, equal won at 2 days [S10].

SM-2 (Wozniak 1990): every item starts with easiness 2.5; intervals are 1 day, 6 days, then previous times EF; EF changes by `0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)` on a 0 to 5 grade with a floor of 1.3; any grade below 3 restarts at day 1 without changing EF [S11]. FSRS (Ye) models difficulty (1 to 10), stability (the interval at which recall probability reaches 90%) and retrievability (recall probability). FSRS-6 has 21 fitted parameters, a power-law curve `R(t,S) = (1 + factor * t/S)^(-w20)`, and picks the next interval by solving that curve for the desired retention; stability grows more for easy cards and for reviews at low retrievability, and drops on a lapse [S12]. The author's benchmark on about 10,000 Anki collections gives log loss 0.3460 for FSRS-6 and 0.4694 for Duolingo's HLR; the README states FSRS-6 beats Anki's default SM-2 on 99.6% of collections, though the summary table I could read omits the SM-2 row [S13]. Anki defaults desired retention to 90% and warns that above 97% workload becomes overwhelming [S14].

Settles and Meeder 2016 (Duolingo, ACL): half-life regression sets `p = 2^(-lag/h)` with `h = 2^(weights . features)`, fitted to 12.9 million session traces. Features are exposure, correct and incorrect counts plus one indicator per lexeme tag. HLR had lower mean absolute error (0.128) than Leitner (0.235) and Pimsleur (0.445), and deploying it raised daily engagement 12% [S15]. HLR predicts recall on Duolingo exercises and engagement, not proficiency.

### 3. Interleaving

Rohrer and Taylor 2007: blocked practice on four volume formulas scored 89% during practice against 60% mixed, but a week later mixed scored 63% against 20% (d 1.34) [S16]. Rohrer, Dedrick and Stershic 2015: interleaved beat blocked at 1 day (80% vs 64%, d 0.42) and 30 days (74% vs 42%, d 0.79) [S17]. Rohrer et al. 2020, randomised trial with 787 students: 61% vs 38%, d 0.83 [S18]. Rohrer 2012: interleaving works because the learner must pick which procedure applies [S19]. Brunmair and Richter 2019 (59 studies): g 0.42 overall, larger for similar categories and complex material, 0.34 for mathematics, about -0.39 for word lists [S20].

### 4. Self-explanation and elaborative interrogation

Chi et al. 1989: students who explained worked examples to themselves learned with understanding and relied less on examples later [S21]. Chi et al. 1994: eighth graders prompted to explain each line of a text gained more than controls, and every high explainer reached the correct mental model [S22]. Bisra et al. 2018 (69 effects): g 0.55 for self-explanation prompts [S23]. Dunlosky et al. rate both moderate utility [S4].

### 5. Worked examples and expertise reversal

Sweller 1988: means-ends problem solving consumes the working memory needed to build schemas [S24]. Sweller and Cooper 1985: worked examples in algebra cut learning time and errors (a secondary summary gives half the time and one fifth the errors) [S25]. Kalyuga et al. 2001: the worked-example advantage for apprentices shrank and reversed as knowledge grew [S26]. Kalyuga et al. 2003 name this the expertise reversal effect: guidance that helps novices becomes redundant and can hurt experienced learners [S27].

### 6. Dual coding and multimedia

Paivio 1991: verbal and imaginal codes are separate and additive [S28]. Mayer 2009 sets out twelve principles [S29]; handbook chapters report median effects from Mayer's lab: words plus pictures over words alone 1.35 (13 of 13 tests), removing extraneous material 0.86 (16 of 16), placing text beside its picture 1.10 (22 of 22), presenting them at the same time 1.22 (9 of 9) [S30, S31]; segmenting and pretraining are among the twelve [S29]. Learning styles are the myth: Pashler et al. 2008 found no adequate evidence for the required crossover interaction [S32].

### 7. Desirable difficulties

Bjork and Bjork 2011 list spacing, interleaving, testing, generation and varied practice as difficulties that build storage strength while slowing retrieval strength, and warn that a difficulty is undesirable when the learner lacks the background to respond successfully [S33]. The storage versus retrieval strength distinction is Bjork and Bjork 1992 [S34]. Rowland 2014: low success on practice tests shrinks the testing effect [S5].

### 8. Pretesting

Kornell, Hays and Bjork 2009: guessing answers to fictional trivia before seeing them gave 41% final recall versus 31% for reading question and answer together (d 0.58), and the effect held for weak word associates [S35]. Richland, Kornell and Kao 2009: answering questions before reading a passage gave 75% versus 56% for extended study (d 1.1), scoring only items missed on the pretest (95% of them) [S36].

### 9. Immediate feedback, and production versus recognition

Kulik and Kulik 1988 (53 studies): applied classroom studies favour immediate feedback; laboratory list-learning studies often favour delayed [S37]. Kang, McDermott and Roediger 2007: with feedback, short-answer practice gave the best retention 3 days later; without feedback, multiple choice did better because short-answer success was lower [S38]. Butler and Roediger 2008: multiple choice exposes learners to lures; feedback raised correct answers and cut lure intrusions on a later cued-recall test [S39]. Rowland 2014: larger effects for recall than recognition and with feedback than without [S5]. Smith, Roediger and Karpicke 2013: typing the answer and only thinking it gave the same benefit, provided retrieval happened [S40].

### 10. Duolingo mechanics

Jiang et al. 2020 and 2021: 225 learners who finished the beginner Spanish or French units using only Duolingo reached Intermediate Low reading and Novice High listening on ACTFL tests, comparable to fourth-semester university students, in about half the time [S41, S42]. That is Duolingo's only published learning-outcome evidence. Streaks and notifications are engagement work: Yancey and Settles 2020 optimised reminder copy for 0.5% more daily active users and 2% better new-user retention [S43]; Duolingo's blog reports a streak wager raising day-7 retention 14% [S44] and streak animations raising 7-day survival 1.7% [S45]. Neither post measures learning. Bite-size sessions, mixed review and immediate feedback map onto findings 1, 2, 3 and 9; the streak maps onto habit.

### 11. Memory for exact strings

The keyword mnemonic is fast at first and decays fast: Wang, Thomas and Ouellette 1992 found keyword learners forgot far more than rote learners on a delayed test [S46]; Dunlosky et al. rate it low utility [S4]. Retrieval with feedback and spacing (findings 1, 2) is the supported route. Generation helps: Slamecka and Graf 1978 [S47] and Bertsch et al. 2007 (d 0.40, 86 studies) [S48] show producing an item beats reading it. Typing versus saying does not matter [S40]; producing from a cue rather than recognising does. Bjork and Bjork 1992 explains the cue: retrieval strength is tied to the cues present, so the drill cue should be the situation ("acquire a lock with a TTL only if absent"), not the command name [S34].

## Lesson page format

1. Open with one pretest question about the mechanism, answer shown on submit (finding 8).
2. Present the mechanism as a strip of short panels, each pairing a few sentences with a diagram of the same step, names introduced first, nothing decorative (finding 6).
3. First encounter as a worked trace; problem-first once the pattern recurs across projects (finding 5).
4. One production exercise per strip (typed answer or cued free recall), graded on submit with the correct answer shown, before the next strip (findings 1, 9). Multiple choice only with feedback and real-misconception lures (finding 9).
5. After the mechanism, one self-explanation prompt: "why must step 3 precede step 4?" (finding 4).
6. Close with a recall-card list of at most five strings, each cued by a situation, not a name (finding 11).
7. Three to five strips and five to eight retrieval items per page (findings 6 and 9).

## Drill scheduler

1. Prefer FSRS-style per-card stability and difficulty at a target retrievability of 0.90 over SM-2's fixed multipliers; the benchmark shows better calibration and Anki documents the retention knob (finding 2, S12 to S14). If FSRS is too heavy for a JSON file, SM-2 with day intervals is fine; schedule shape matters far less than total spacing (S9).
2. First intervals: wrong 1 day, partial 2 days, correct 4 days. These match Cepeda's 1-day optimum for a week-long horizon and Anki's 1-day graduating and 4-day easy defaults (S7, S14).
3. A lapse resets to 1 day and raises difficulty; never zero spacing (S11, S12).
4. Two correct in a row jumps to 10 to 14 days, then about 21 days; retire from daily drill after three correct recalls at wide gaps. Implemented as retirement after the fourth consecutive correct answer, so the 21-day recall itself happens before the card leaves the daily queue. Rawson and Dunlosky 2011 found three correct recalls then three spaced relearnings the efficient point [S49]; Cepeda found 21 days optimal for a 70-day horizon (S7).
5. Score partial answers as partial but schedule from the last fully correct recall; the feedback carries the benefit (findings 8, 9).
6. Interleave projects and contexts within a session: never two consecutive cards from the same project or mechanism family, so the card must be identified before it is answered (finding 3).
7. About 20 cards or 15 minutes, due cards plus a few new; no primary source prescribes a length, so this follows finding 10 and the load limits in finding 6.
8. Production only (typed command or spoken explanation) with the answer shown at once; no recognition-only cards for strings (findings 9, 11).

## Claims I could not trace to a primary source

- Wang, Thomas and Ouellette 1992's delayed-test interval (summaries disagree: 2 days or 1 week; abstract unreachable).
- Sweller and Cooper 1985's "half the time, one fifth the errors" (secondary summary; the abstract confirms direction only).
- Rowland 2014's 0.73 with feedback versus 0.39 without (secondary summary).
- "FSRS needs 20 to 30% fewer reviews than SM-2": third-party blogs, not the benchmark README.
- Any Duolingo publication linking streaks or notifications to learning outcomes (none on research.duolingo.com).
- Any study of memorising command-line flags; finding 11 extrapolates from vocabulary work.
- Session length; no primary source prescribes one.

## Sources

- S1. Roediger, Karpicke 2006, Psychological Science 17(3). https://doi.org/10.1111/j.1467-9280.2006.01693.x
- S2. Karpicke, Blunt 2011, Science 331. https://doi.org/10.1126/science.1199327
- S3. Karpicke, Roediger 2008, Science 319. https://doi.org/10.1126/science.1152408
- S4. Dunlosky, Rawson, Marsh, Nathan, Willingham 2013, PSPI 14(1). https://doi.org/10.1177/1529100612453266
- S5. Rowland 2014, Psychological Bulletin 140(6). https://doi.org/10.1037/a0037559
- S6. Cepeda, Pashler, Vul, Wixted, Rohrer 2006, Psychological Bulletin 132(3). https://escholarship.org/uc/item/3rr6q10c
- S7. Cepeda, Vul, Rohrer, Wixted, Pashler 2008, Psychological Science 19(11). https://files.eric.ed.gov/fulltext/ED505660.pdf
- S8. Latimier, Peyre, Ramus 2021, Educational Psychology Review 33. https://doi.org/10.1007/s10648-020-09572-8
- S9. Karpicke, Bauernschmidt 2011, JEP:LMC 37(5). https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Bauernschmidt_JEPLMC.pdf
- S10. Karpicke, Roediger 2007, JEP:LMC 33(4). https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JEPLMC.pdf
- S11. Wozniak 1990, Algorithm SM-2, Optimization of Learning (thesis), SuperMemo. https://super-memory.com/english/ol/sm2.htm
- S12. Ye, The Algorithm, open-spaced-repetition wiki. https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- S13. open-spaced-repetition, srs-benchmark README. https://github.com/open-spaced-repetition/srs-benchmark
- S14. Anki manual, Deck Options. https://docs.ankiweb.net/deck-options.html
- S15. Settles, Meeder 2016, ACL. https://aclanthology.org/P16-1174/
- S16. Rohrer, Taylor 2007, Instructional Science 35. https://doi.org/10.1007/s11251-007-9015-8
- S17. Rohrer, Dedrick, Stershic 2015, JEP 107(3). https://files.eric.ed.gov/fulltext/ED557355.pdf
- S18. Rohrer, Dedrick, Hartwig, Cheung 2020, JEP 112(1). https://doi.org/10.1037/edu0000367
- S19. Rohrer 2012, Educational Psychology Review 24. https://doi.org/10.1007/s10648-012-9201-3
- S20. Brunmair, Richter 2019, Psychological Bulletin 145(11). https://doi.org/10.1037/bul0000209
- S21. Chi, Bassok, Lewis, Reimann, Glaser 1989, Cognitive Science 13. https://doi.org/10.1207/s15516709cog1302_1
- S22. Chi, de Leeuw, Chiu, LaVancher 1994, Cognitive Science 18. https://doi.org/10.1207/s15516709cog1803_3
- S23. Bisra, Liu, Nesbit, Salimi, Winne 2018, Educational Psychology Review 30. https://doi.org/10.1007/s10648-018-9434-x
- S24. Sweller 1988, Cognitive Science 12. https://doi.org/10.1016/0364-0213(88)90023-7
- S25. Sweller, Cooper 1985, Cognition and Instruction 2(1). https://doi.org/10.1207/s1532690xci0201_3
- S26. Kalyuga, Chandler, Tuovinen, Sweller 2001, JEP 93(3). https://doi.org/10.1037/0022-0663.93.3.579
- S27. Kalyuga, Ayres, Chandler, Sweller 2003, Educational Psychologist 38(1). https://doi.org/10.1207/S15326985EP3801_4
- S28. Paivio 1991, Canadian Journal of Psychology 45(3). https://doi.org/10.1037/h0084295
- S29. Mayer 2009, Multimedia Learning, 2nd ed., Cambridge. https://doi.org/10.1017/CBO9780511811678
- S30. Butcher 2014, The multimedia principle, Cambridge Handbook of Multimedia Learning, 2nd ed. https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/multimedia-principle/C5AF7600A773D67C79BA31BBD695743A
- S31. Mayer, Fiorella 2014, Principles for reducing extraneous processing, same handbook. https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E
- S32. Pashler, McDaniel, Rohrer, Bjork 2008, PSPI 9(3). https://doi.org/10.1111/j.1539-6053.2009.01038.x
- S33. Bjork, Bjork 2011, Psychology and the Real World, Worth. https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/EBjork_RBjork_2011.pdf
- S34. Bjork, Bjork 1992, From Learning Processes to Cognitive Processes, Erlbaum. https://bjorklab.psych.ucla.edu/robert-a-bjork-publications/
- S35. Kornell, Hays, Bjork 2009, JEP:LMC 35(4). https://web.williams.edu/Psychology/Faculty/Kornell/Publications/Kornell.Hays.Bjork.2009.pdf
- S36. Richland, Kornell, Kao 2009, JEP:Applied 15(3). https://learninglab.uchicago.edu/Pre-Testing_files/RichlandKornellKao.pdf
- S37. Kulik, Kulik 1988, Review of Educational Research 58(1). https://doi.org/10.3102/00346543058001079
- S38. Kang, McDermott, Roediger 2007, European Journal of Cognitive Psychology 19. https://doi.org/10.1080/09541440601056620
- S39. Butler, Roediger 2008, Memory and Cognition 36. https://doi.org/10.3758/MC.36.3.604
- S40. Smith, Roediger, Karpicke 2013, JEP:LMC 39(6). https://learninglab.psych.purdue.edu/downloads/2013/2013_Smith_Roediger_Karpicke_JEPLMC.pdf
- S41. Jiang, Rollinson, Plonsky, Pajak 2020, Duolingo Research Report DRR-20-04. https://duolingo-papers.s3.amazonaws.com/reports/duolingo-efficacy-whitepaper.pdf
- S42. Jiang, Rollinson, Plonsky, Gustafson, Pajak 2021, Foreign Language Annals 54. https://doi.org/10.1111/flan.12600
- S43. Yancey, Settles 2020, KDD. https://research.duolingo.com/papers/yancey.kdd20.pdf
- S44. Loh 2017, Duolingo blog. https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/
- S45. Mansur 2022, Duolingo blog. https://blog.duolingo.com/how-duolingo-streak-builds-habit
- S46. Wang, Thomas, Ouellette 1992, JEP 84(4). https://doi.org/10.1037/0022-0663.84.4.520
- S47. Slamecka, Graf 1978, JEP:HLM 4(6). https://doi.org/10.1037/0278-7393.4.6.592
- S48. Bertsch, Pesta, Wiscott, McDaniel 2007, Memory and Cognition 35(2). https://doi.org/10.3758/BF03193441
- S49. Rawson, Dunlosky 2011, JEP:General 140(3). https://doi.org/10.1037/a0023956
