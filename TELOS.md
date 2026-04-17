# Telos

"Give me a ping, Vasili. One ping only, please." - Captain Marko Ramius

## What Sonar Is

You command a Soviet submarine defecting through a mine-filled ocean toward the United States. The ocean is dark. Your only mechanism to see the world around you is Sonar, a soundwave that radiates outward, bounces off surfaces, and returns a brief glimpse of your surroundings. Then it fades, and you are blind again.

## The Core Tension

Every tool the player has costs something:

- **Sonar** reveals the world, but enemy submarines hear the ping and attempt to intercept you.
- **Engines** propel you towards freedom, but nearby enemies can track your noise.
- **Silent running** eliminates your engine noise, but greatly reduces your speed.
- **Torpedoes** clear obstacles and light up the path ahead using the missile's soundwaves, but they broadcast your position with every pulse.

There is no safe action. The player must constantly choose which danger to accept, and the game's depth comes from these stacked tradeoffs, not from mechanical complexity.

## The Feel

The aesthetic is 80s military hardware rendered in monochrome red on black: CRT scanlines, synthesized audio, monospace type.

The game should feel like operating equipment, not playing a video game. The sonar ping sounds like sonar. The engine drones. The death sound is an underwater implosion, not an arcade explosion. The title screen's radar sweep plays the opening notes of the Soviet national anthem as the arm passes over each blip — a music box from military hardware.

The visual language is minimal. Red means sonar. The dock's green glow, the light at the end. Everything else is darkness.

Silence is a texture, not an absence. The moments between pings–when the player is navigating on memory, coasting on momentum, listening for the proximity blip that says *something is close but I don't know what*—are the game. The pings are punctuation.

## The Journey

The canyon has four zones, each with a distinct personality built from the same mechanics:

**Open Waters** — Wide, safe, quiet. The tutorial lives here: one mechanic at a time, one sentence per lesson, each timed to appear just before the player encounters the threat it describes. By the end, the player knows everything. No walls of text, no instruction manual. You learn by doing.

**The Narrows** — The canyon tightens and begins to curve. S-bends force the player to ping just to see the turn ahead. The first enemy submarine appears. More mines. This is where the player first feels the tradeoff: the walls are close and you *need* to see, but seeing brings the enemy.

**Devil's Corridor** — Chokepoints where the canyon pinches to barely wider than the submarine. More mines. Aggressive, fast-moving enemy subs with powerful listening equipment. The hardest navigation in the game. This is where most runs end, and where torpedoes become valuable.

**Freedom** — The canyon opens into a bay dotted with rock formations. After the claustrophobia of Devil's Corridor, the bay is a physical relief. But the enemies here are the fastest and most desperate to stop you. "FREEDOM" appears in blue, the only non-red text in the game. The dock glows green at the far end. 

When you arrive: *Welcome to America.* A waving ASCII flag.

## Design Principles

**Refine, don't add.** The game has minimal inputs and minimal features. For a submarine, the ocean is barren and dark. New challenges come from the environment, enemies, and the length of the journey, not from new power-ups or abilities.

**Deaths should feel earned.** The player should always know what killed them and feel they could have avoided it. The passive visibility range ensures you see what's about to kill you. The 5-point collision hull matches the submarine's visual shape. The death screen shows the killer object, what it was, and a contextual tip. But sometimes, you just died because you didn't ping, leaving you blind.

**Sound tells the story.** Per-object sonar echoes create a cascade of return pings in dense areas. The proximity blip warns without revealing direction. The torpedo launch has its own distinct sound. The engine drone scales with speed. The death sound lingers — a 2.5-second underwater groan, not a quick pop. Audio feedback should be rich enough that a skilled player could almost navigate by ear.

**The ending matters.** This is not an infinite runner. It is a short, tense, finite journey from the Barents Sea to Maine. The destination gives the journey meaning. The waving flag is the reward. "Welcome to America" is not a score screen — it's the emotional climax of the Cold War narrative framing the game. Every design decision serves this: the zones are acts in a story, the difficulty curve is dramatic pacing, and the final zone is called "Freedom" because that's what the player is actually reaching for.

## What This Is Not

- Not a simulator. The physics are arcade. The sonar is stylized. The submarine handles like a game piece, not a vessel.
- Not a shooter. Torpedoes exist but they're a limited, costly, strategic resource, not a primary action.
- Not a racer. This game is about surviving through caution and secrecy. Any collision means death.
- Not an infinite runner. Each run is one journey, one destination, one story. The journey is randomized for replayability, but the structure is fixed: four zones + one ending.
- Not complex. A first-time player should understand the entire game within 60 seconds of gameplay. The depth is in the decisions, not the mechanics.
