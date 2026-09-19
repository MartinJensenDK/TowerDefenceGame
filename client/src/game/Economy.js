/** Gold (spendable), score (highscore) and base lives. */
export class Economy {
  constructor({ gold = 0, lives = 20 } = {}) {
    this.gold = gold;
    this.score = 0;
    this.lives = lives;
  }

  canAfford(cost) {
    return this.gold >= cost;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    return true;
  }

  earn({ gold = 0, score = 0 } = {}) {
    this.gold += gold;
    this.score += score;
  }

  /** Returns true when lives hit zero. */
  loseLives(n) {
    this.lives = Math.max(0, this.lives - n);
    return this.lives === 0;
  }

  snapshot() {
    return { gold: this.gold, score: this.score, lives: this.lives };
  }
}
