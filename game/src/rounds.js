// Rounds and money: freeze time to buy, a live round to 100 seconds, a planted charge
// with a 40 second fuse, and a match that ends when one side takes five rounds. The
// economy pays for kills, plants and defuses, and for winning or losing a round, with a
// loss streak softening the blow.
import { priceOf, WEAPONS } from './weapons.js';

export const FREEZE_SECONDS = 6;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 40;
export const END_SECONDS = 4;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const DEFUSE_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_STREAK_CAP = 1000;

export function createRounds(events) {
  const state = {
    phase: 'freeze',
    round: 1,
    score: { embers: 0, wardens: 0 },
    timer: FREEZE_SECONDS,
    money: 800,
    lossStreak: 0,
    bomb: { planted: false, site: null, pos: null, fuse: 0 },
    endReason: '',
    winner: null,
  };

  function startRound() {
    state.phase = 'freeze';
    state.timer = FREEZE_SECONDS;
    state.bomb = { planted: false, site: null, pos: null, fuse: 0 };
    state.endReason = '';
    events.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'matchEnd') return;
    state.phase = 'end';
    state.timer = END_SECONDS;
    state.endReason = reason;
    state.winner = winner;
    state.score[winner] += 1;
    if (winner === 'embers') {
      state.money += WIN_REWARD;
      state.lossStreak = 0;
    } else {
      state.money += LOSS_REWARD + Math.min(LOSS_STREAK_CAP, state.lossStreak * LOSS_STREAK_BONUS);
      state.lossStreak += 1;
    }
    events.onRoundEnd(winner, reason, state.score);
  }

  function endMatch(winner) {
    state.phase = 'matchEnd';
    state.winner = winner;
    events.onMatchEnd(winner, state.score);
  }

  function step(dt, ctx) {
    if (state.phase === 'matchEnd') return;
    state.timer -= dt;
    if (state.phase === 'freeze') {
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        events.onLive();
      }
      return;
    }
    if (state.phase === 'live') {
      if (ctx.embersAlive <= 0) { endRound('wardens', 'Embers eliminated'); return; }
      if (ctx.wardensAlive <= 0) { endRound('embers', 'Wardens eliminated'); return; }
      if (state.timer <= 0) { endRound('wardens', 'Time expired'); return; }
      return;
    }
    if (state.phase === 'planted') {
      state.bomb.fuse -= dt;
      if (ctx.embersAlive <= 0) { endRound('wardens', 'Embers eliminated'); return; }
      if (ctx.wardensAlive <= 0) { endRound('embers', 'Wardens eliminated'); return; }
      if (state.bomb.fuse <= 0) {
        events.onDetonation(state.bomb.pos);
        endRound('embers', 'Charge detonated');
      }
      return;
    }
    if (state.phase === 'end') {
      if (state.timer <= 0) {
        if (state.score.embers >= WIN_ROUNDS) { endMatch('embers'); return; }
        if (state.score.wardens >= WIN_ROUNDS) { endMatch('wardens'); return; }
        if (state.round >= MAX_ROUNDS) {
          endMatch(state.score.embers > state.score.wardens ? 'embers' : 'wardens');
          return;
        }
        state.round += 1;
        startRound();
      }
    }
  }

  function plant(site, pos) {
    if (state.phase !== 'live') return false;
    state.phase = 'planted';
    state.bomb = { planted: true, site, pos, fuse: BOMB_SECONDS };
    state.money += PLANT_REWARD;
    events.onPlant(site);
    return true;
  }

  function defuse() {
    if (state.phase !== 'planted') return false;
    state.bomb = { planted: false, site: null, pos: null, fuse: 0 };
    state.money += DEFUSE_REWARD;
    events.onDefuse();
    endRound('wardens', 'Charge defused');
    return true;
  }

  function buy(id, inventory) {
    const price = priceOf(id);
    if (state.phase !== 'freeze' || state.money < price) return false;
    if (WEAPONS[id]) {
      if (inventory.primary === id) return false;
      state.money -= price;
      inventory.primary = id;
      inventory.primaryMag = WEAPONS[id].mag;
      inventory.primaryReserve = WEAPONS[id].reserve;
      events.onBuy(id);
      return true;
    }
    if (id === 'armor') {
      if (inventory.armor >= 100) return false;
      state.money -= price;
      inventory.armor = 100;
      events.onBuy(id);
      return true;
    }
    if (id === 'frag' || id === 'smoke' || id === 'flash') {
      if (inventory[id] >= 2) return false;
      state.money -= price;
      inventory[id] += 1;
      events.onBuy(id);
      return true;
    }
    return false;
  }

  return {
    state,
    step,
    plant,
    defuse,
    buy,
    startRound,
    awardKill() { state.money += KILL_REWARD; },
  };
}
