# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/jackflank4-lang/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/jackflank4-lang/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Emberline** — a round-based tactical FPS in the Counter-Strike style, built on three.js 0.187.0. Two teams fight over Kiln Yard at dusk: the Embers attack, the Wardens defend two bomb sites. Short rounds, money between rounds, a buy menu, five guns and three grenades, and gunfire where stopping to aim pays.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Single-player against bots, no network.

## How it plays

- First to 5 rounds. Win a round by eliminating the other team, by detonating the planted charge, or (as Wardens) by running the clock out or defusing.
- Money: $800 to start, $300 a kill, $3,250 a round won, $1,900 a round lost (plus a loss-streak bonus). Spend it in the buy menu (B during freeze time): SMG, shotgun, rifle, sniper, kevlar, frag, smoke and flash grenades.
- Gunplay: hitscan with headshots worth 4×, recoil and bloom that punish firing on the move, crouching that steadies the aim, and collision with the map throughout.
- Bots: 3 Embers beside you, 4 Wardens against you. They follow routes through the map, hold angles, react to what they see and hear, plant and defuse the charge, and fall back when hurt.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g7tqc4ex&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
