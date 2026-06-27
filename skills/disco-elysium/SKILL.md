---
name: disco-elysium
metadata:
  version: 0.1.0
  description: 'Play Disco Elysium as a text adventure — a detective RPG where you wake
    up with a hangover and no memory in a ruined city. Talk to suspects, investigate
    a murder, wrestle with the voices in your head (your skills), and roll dice to
    decide who you are. Use this skill whenever the user mentions Disco Elysium,
    极乐迪斯科, playing a detective RPG, or wants to experience the game as text.'
---

# Disco Elysium · 极乐迪斯科

You are about to play **Disco Elysium** — a groundbreaking detective RPG, entirely
in text form. You wake up in a trashed hotel room in Revachol with a brutal hangover
and no memory of who you are. A body is hanging from a tree behind the hotel. You
are a cop. You need to solve the murder — and figure out who you are.

## What makes this game special

Disco Elysium has **no combat**. Everything is driven by dialogue and **skill checks**
(dice rolls). Your 24 skills are not stats — they are **voices in your head** that
talk to you, argue with each other, and influence your decisions. Electrochemistry
urges you to do drugs. Volition tries to keep you sane. Inland Empire gives you
hunches. Half Light wants to punch things.

This is a game about **who you choose to be** — a corrupt cop, a superstar detective,
a communist, a fascist, a moralist, or just a sad man trying to get through the day.

## How to play

The game engine runs on a remote server. You interact via the `disco` CLI.

### Start the game

```bash
disco start          # begin from the first real scene (Whirling-in-Rags, Day 1)
disco start 142      # jump to a specific scene if you know the ID
```

This returns the opening dialogue and your first set of choices.

### The main loop: read, decide, advance

```bash
disco play           # auto-advance through narration — stops at your first real choice
disco play 2         # pick option 2, then auto-advance to the next choice
disco play 0         # pick option 0, continue...
```

**How `play` works:**
- The engine automatically runs through **non-decision nodes** (NPC monologues,
  narration, skill voices talking to you) and shows you all the text.
- It **stops** when you reach a point with multiple choices — that's your turn.
- Pass a choice number to make your pick and continue.

**One choice at a time.** Your choices change what comes next — don't pre-plan
multiple choices blindly. Read what happens, then decide.

### Other commands

```bash
disco status         # your current state: scene, money, party, skills, active tasks
disco history 30     # re-read the last 30 entries of dialogue/checks/choices
disco scenes         # list available scenes (search: disco scenes DOOR)
disco save ch1       # save current game to a slot
disco load ch1       # load a saved game
disco saves          # list all saves
```

### Dice checks

When the engine encounters a **skill check**, it rolls 2d6 + your skill level + modifiers
against a difficulty number. The result appears in the trace:

```
🎲 CHECK: Half Light (difficulty 12, RED) — rolled 4+3=7, total 9 → FAILURE ❌
   modifiers: +2 (Painkillers), -1 (No shoes)
```

- **White checks** can be retried (with higher skill or better modifiers later).
- **Red checks** are one-shot — pass or fail, you live with it.
- You don't roll the dice yourself — the engine does it. You just see the result
  and deal with the consequences.

## Your role

You are the detective. Read the dialogue, listen to your skills (they're part of
you), talk to NPCs, investigate. When you reach a choice, **think about who this
character is** and pick accordingly.

- You don't have to be a good cop. You can be a disaster. That's the point.
- Your skills will push you in different directions. They're not always right.
- Failure is not game-over — it opens different paths. Embrace it.
- Kim Kitsuragi is your partner. He's watching. He's judging. He's also the best
  person in the world.

## Tips

- **Read the full trace** each `play` returns. The narration is the soul of the game.
- **Check `disco status`** periodically — your tasks, money, and skill state matter.
- If a scene ends, use `disco scenes` to find where to go next, or just `disco start`
  the next location.
- **Save often** — `disco save before-door` before risky choices.
- If you're lost, `disco history 50` shows you what just happened.

## Language

The game text is in English (original). You can narrate your experience and reasoning
to the user in whatever language they prefer. The dialogue itself stays in English.

## Server

The engine is hosted at `https://disco.royola.dev`. Set `DISCO_SERVER` to override.
The server runs in stateless mode — each CLI invocation is self-contained, no
session management needed. Game state persists on the server between calls.
