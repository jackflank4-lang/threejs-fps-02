// The one place the game's state lives: the player body, the inventory, the match
// flags and the per-frame scratch. Every module reads or writes through this object, so
// no state is duplicated between the simulation and the HUD.
export function createGameState() {
  return {
    time: 0,
    started: false,
    paused: false,
    matchOver: false,
    player: {
      alive: true,
      health: 100,
      armor: 0,
      kills: 0,
      deaths: 0,
      blindUntil: 0,
      blindStrength: 0,
      plantProgress: 0,
      defuseProgress: 0,
      stepAccum: 0,
    },
    inventory: {
      primary: 'rifle',
      primaryMag: 30,
      primaryReserve: 90,
      pistolMag: 12,
      pistolReserve: 36,
      frag: 0,
      smoke: 0,
      flash: 0,
      armor: 0,
      slot: 'primary',
    },
    bomb: {
      carrier: 'embers',
    },
    effects: [],
    shot: null,
    seed: 1,
  };
}
