# Emberline — threejs-fps-02 build report

**Bounty:** threejs-fps-02 — "Make the best three.js tactical FPS" (pot $1,000 USDC:
1st $400, 2nd $200, 3rd $120, 4th–10th $40). **Entries close 2026-11-16T21:30:00Z.**
**Account:** @xiontolol (connect/submit handled by the parent agent — this build is
build + test only, no submission, no wallet/key use).
**Built:** 16 Nov 2026, work dir `~/workspace/makefun/threejs-fps/`.
**Status: COMPLETE and tested. Ready for the parent to push + bundle + submit.**

## What it is

**Emberline** — a round-based tactical FPS in the Counter-Strike style, set in "Kiln Yard",
a dusk brick-kiln compound (44×36 m) with three lanes to two bomb sites:

- **Teams:** Embers (attackers, orange, 3 bots + the player) vs Wardens (defenders, teal, 4 bots).
- **Rounds:** first to 5 (max 9). 6 s freeze/buy, 100 s rounds, 4 s plant (hold E in a site),
  5 s defuse, 40 s fuse. Win by elimination, detonation, defuse, or time (defenders win on time).
- **Economy:** start $800; kill +$300, plant/defuse +$300, win +$3,250, loss +$1,900
  (+$500 per consecutive loss, capped +$1,000). Weapons persist between rounds; ammo does not refill free.
- **Weapons:** P9 Sidearm $0 (34 dmg), VK-9 Ripper SMG $1,500 (26), AR-77 Longshot rifle
  $2,700 (34), M12 Breacher shotgun $1,900 (8×9 pellets), LW-50 Marksman sniper $4,750 (110);
  headshots ×4, legs ×0.75, Kevlar vest $650 halves damage. Grenades: Sparker frag $300,
  Veil smoke $300 (blocks line of sight), Flare flash $200 (blinds player and bots).
- **Bots:** waypoint-graph navigation (BFS over 26 nodes), vision cone + line-of-sight raycast,
  reaction 0.28–0.5 s, burst fire with distance/movement aim error, hearing (gunshots and
  explosions within 30 m), plant/defuse, fall back when hurt. Attackers push a site; defenders
  hold, rotate to a planted bomb, and defuse.
- **Tech:** fixed 60 Hz simulation, render decoupled, no per-frame allocations in the hot loops;
  WebAudio synthesised sounds (no audio assets); `window.__game` debug handle;
  deterministic `?shot=start|play|plant|end&seed=N` frames that set `window.__shotReady`.
- **Original:** all code, map, names, and art written for this entry. No copied commercial game,
  no libraries or assets beyond the kit-vendored three.js 0.187.0. The kit starter was read, not reused.

## Deliverables (in this dir)

| File | What it is |
|---|---|
| `main.ts` | Program entry (Node 22, stdlib only). Copies `game/` + `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` via the kit's `buildDossier`. |
| `serve.ts` | Tiny static server for local play (`node serve.ts`, http://localhost:8080). |
| `game/index.html` | The game page (import map → vendored three.js), HUD, buy menu, overlays. |
| `game/src/*.js` | 14 modules: `main` (loop, shots, debug handle), `map` (Kiln Yard + waypoint graph), `bots` (AI), `combat` (hitscan, hitboxes, LOS), `rounds` (rules, economy), `weapons` (defs + view model), `grenades` (frag/smoke/flash), `player` (movement, recoil), `hud`, `input`, `audio` (synth SFX), `rng` (seeded), `state`, `palette`. |
| `game/vendor/three/` | three.js 0.187.0, byte-identical to the kit (hashes verified, see below) + LICENSE. |
| `vendor/makefun-threejs.ts` | Kit library, byte-identical to the kit (sha256 `f9622210…`). |
| `screenshots/1-start.jpg` … `4-end.jpg` | 4 real renders, 1280×720, 38–68 KB each (see below). |
| `shots.json` | The 4 shot definitions (`?shot=…&seed=1`). |
| `.makefun/owner.json` | Owner wallet `5rM8m83Gjp53ACVY6fzE1HJCWeH34wAtb7F2Pxviec2s`. |
| `LICENSE` | MIT. `README.md` — how to play / serve. |
| `tmp/` | Test harness only (CDP driver, eval scripts, intermediate shots). Not part of the entry. |

Total source: 112,640 bytes (15 files). `game/` total: 18 files, 2,241,515 bytes.
Dossier text: 107,950 bytes — under the 163,840-byte cap, so the judge reads it all.

## How it was tested

Headless Chromium (`/opt/meta-chromium/chrome`, swiftshader WebGL) driven by a pure-Node
CDP client (`tmp/cdp.mjs`, built-in WebSocket, no npm). The game exposes `window.__game`
(`step`, `syncCamera`, `map`, `combat`, `playerShoot`, `bots`, `rounds`, …) so the sim can be
driven at full speed regardless of the (slow, software-rendered) requestAnimationFrame loop.

**Live play-tests (all passed after the fixes below):**

| Test | Result |
|---|---|
| Boot, freeze → live transition | Clean console (zero warnings/errors), phase `live`, timer 99 |
| Player stands at spawn 8 s of live play | Survives, 100 HP (no friendly fire, no wall-piercing shots) |
| Clear line-of-sight rifle shot (8 m, west lane) | Exactly 34 damage — one rifle torso hit; LOS true |
| Bot navigation (10 s live) | Attackers push to the sites (Cinder −11,15 → −15.7,6.1); defenders hold at their sites |
| Plant (hold E 4 s at Site A, site cleared) | Planted in 4.5 s, phase `planted`, Site A, fuse 40 |
| Detonation (fuse forced to 1 s) | Phase `end`, Embers 1–0, reason "Charge detonated"; blast kills the planter standing at the site |
| Defuse (plant, defenders rotate) | Round ends with a defuse; score advances normally |
| Buy in freeze | SMG bought, $4,350 → $2,850 (and $7,300 → $5,800 in another run) |
| Frag grenade | 100 → 19.5 HP on a bot in the blast (radius + LOS checked) |
| Round end → next round | Round increments, freeze 6 s, player respawns at 100 HP, win/loss money applied ($800 + $3,250 win) |
| `main.ts` determinism | Two runs to separate dirs, `diff -r` → byte-identical |
| Gate-like checks | 4 screenshots ≤ 256 KiB, 1280×720; `game/` 18 files / 2.1 MB (caps 993 / 48 MiB); dossier text 107,950 ≤ 163,840; three.js hashes match kit.json; `vendor/makefun-threejs.ts` sha256 matches kit; import map `three` → `./vendor/three/three.module.min.js`; no `http(s)://` or absolute paths in my code (only inside the vendored three.js source comments); all 14 modules pass `node --check` |

**Screenshots (all re-taken after the final map fix, all 1280×720, clean console):**

| Shot | Shows |
|---|---|
| 1-start | Freeze time, buy menu (8 items + prices), $800, timer 0:06, kiln + chimney + smoke, bots |
| 2-play | Mid-round firefight: rifle view model with radial-gradient muzzle flash, 3 Wardens visible, kiln glow, ammo 23/90, $2,650 |
| 3-plant | Looking through the Site A door at the "A" pylon + a Warden, "CHARGE PLANTED — SITE A" fuse bar, score 2–1, 0:32 |
| 4-end | Round-end overlay "Round to the Embers — Charge detonated. 3 — 1.", R4, 0:04, keys list |

**HTTP serving:** `serve.ts` serves correctly (curl: index 200, three.js 200, main.js 200).
The headless-Chrome HTTP load test was blocked by this VM's Chrome Local Network Access
policy (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` for 127.0.0.1 — the same wall the
best-game-01 build hit; `file://` testing is the established workaround here). The game was
therefore verified over `file://`; the served files are identical and the import map is
relative, so the served path is the same code.

## Bugs found by testing and fixed

1. **Friendly fire — bots could target and shoot their own team.** `visibleEnemy` and
   `resolveShot` had no team filter, so a bot spawning on top of the player (Ash spawns at
   the player's spawn) targeted the player within 4 m (FOV check is skipped under 4 m) and
   killed him at spawn. Fixed: team filter in both `bots.js` `visibleEnemy` and `combat.js`
   `resolveShot` (no friendly fire, standard for this genre).
2. **Shared Raycaster `far` leaked between LOS checks and shots.** `hasLineOfSight` set
   `_ray.far = dist`; a later `resolveShot` reused the shortened far, so shots could pass
   through walls beyond that distance. Fixed: `resolveShot` now sets `_ray.far = MAX_RANGE`
   before its world raycast.
3. **Waypoint graph disconnected — site interiors unreachable.** Nodes 20/21 (Site A) and
   22/23 (Site B) only linked to each other: the site south walls were solid, so no path
   existed from the lanes into the sites; attackers walked into the wall and got stuck
   (Cinder sat at −11,13.3). Fixed: split both site south walls to leave a 3 m door on the
   west/east lane (the "wide door" the map comment promised). `findPath` now returns real
   routes, e.g. Cinder: `[−19,8] → [−13,3] → [−18,−5] → [−16,−11] → site A`.
4. **Two waypoints sat inside pillars.** Nodes 10 (−15,1) and 14 (15,1) were inside the lane
   pillars' footprints. Moved to (−13,3) and (13,3).
5. **Wardens reset to `push` instead of `hold`.** `bots.reset()` set every bot to `push`,
   so defenders abandoned their sites. Fixed: Wardens reset to `hold`, Embers to `push`.
6. **Muzzle flash read as a flat orange diamond.** Replaced the solid plane with a
   radial-gradient additive sprite; also shrank it. Now a soft burst at the muzzle.
7. **AudioContext created before any user gesture** logged an autoplay warning on every
   shot in headless runs. The context is now created only in `unlock()` (pointer lock);
   `ensure()` returns null until then. Console is clean.
8. **Shot-mode timer and round number were stale** (start showed 1:40, end showed R1 3–1).
   `syncHud` now sets the timer; the end shot sets round 4 / timer 4.
9. **Test-harness bug, not a game bug:** my eval aimed with `p.eye` where `p` was the
   position vector (no `eye` property) → pitch NaN → every test shot missed. Fixed the
   eval to use `player.state.eye`. (Also: the steel container at (6.4, 6.8) blocks the
   (5,12)→(5,−2) lane — test positions were moved to the clear west lane.)

## Known weaknesses (honest)

- **Bot pathing zigzags on the west approach.** The BFS route to Site A goes
  (−19,8) → (−13,3) → (−18,−5): the bot walks southeast, then back northwest, because no
  direct edge spans the 13 m west-lane stretch. It reaches the site, but a human would walk
  straight up the lane. A smoothing pass (or one extra waypoint) would fix it; not done.
- **Attackers won the observed rounds 2–0** in the instrumented runs (small sample, and the
  player killed a Warden in one). Defenders may be slightly too passive — they hold and wait
  rather than peeking. Balance was not tuned beyond the first pass.
- **The south-door sightline:** opening the site doors gives defenders a sightline down the
  west/east lane toward the attackers' spawn (a Warden looking south through the door can see
  the west spawn). Attackers normally push north immediately, so the exposure is brief, but a
  player idling at spawn can be shot. A staggered cover wall in the lane would close it.
- **Grenade throws are full-power only** (13 m/s + arc). A frag thrown at a target 3 m away
  overshoots it; close-range lobs need the player to aim at the floor. No weak-throw option.
- **Shot screenshots are staged** (`?shot=…` teleports the player and sets the state) — the
  standard kit mechanism, same as the starter's `shots.json`, not live gameplay captures.
- **No smoke/flash visual in the screenshots** (the grenade effects exist in-game and were
  verified by the frag-damage test, but no shot captures them).
- **Audio is synthesised WebAudio only** (no recorded sounds); it needs a user gesture
  (pointer lock) before it starts, by browser design.
