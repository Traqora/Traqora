/**
 * Search Cache Hit-Rate SLO Calculator and Tracker
 */
class SearchCacheSLO {
  constructor(targetRatio = 0.85) {
    this.targetRatio = targetRatio;
    this.hits = 0;
    this.misses = 0;
  }

  recordHit() {
    this.hits++;
  }

  recordMiss() {
    this.misses++;
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
  }

  getMetrics() {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0.0 : this.hits / total;
    const sloMet = total === 0 ? true : hitRate >= this.targetRatio;
    return {
      hits: this.hits,
      misses: this.misses,
      total,
      hitRate,
      targetRatio: this.targetRatio,
      sloMet
    };
  }
}

module.exports = { SearchCacheSLO };
