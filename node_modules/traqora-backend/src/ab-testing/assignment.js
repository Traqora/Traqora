/**
 * A/B Testing - User/Variant Assignment (#248)
 *
 * Handles user segmentation, group assignment, and variant targeting
 * for A/B testing experiments. Supports deterministic hash-based
 * assignment and override/targeting rules.
 */

const crypto = require('crypto');

class AssignmentService {
  constructor(experimentManager) {
    this.experimentManager = experimentManager;
  }

  /**
   * Assign a user to an experiment variant.
   * Returns the variant ID or null if user is not part of traffic allocation.
   */
  assign(experimentId, userId, userAttributes = {}) {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    // Check forced override
    const override = this._checkOverrides(experiment, userId, userAttributes);
    if (override) return override;

    // Check targeting rules
    if (!this._evaluateTargeting(experiment, userAttributes)) {
      return null;
    }

    // Standard assignment
    return this.experimentManager.assignUser(experimentId, userId);
  }

  /**
   * Get a user's assigned variant.
   */
  getAssignedVariant(experimentId, userId) {
    return this.experimentManager.getUserVariant(experimentId, userId);
  }

  /**
   * Bulk assign users to experiments (for batch processing).
   */
  bulkAssign(experimentId, userIds) {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    const assignments = [];
    for (const userId of userIds) {
      const variantId = this.assign(experimentId, userId);
      assignments.push({ userId, variantId });
    }
    return assignments;
  }

  /**
   * Check forced variant overrides for specific users or attributes.
   */
  _checkOverrides(experiment, userId, userAttributes) {
    // Check for direct user override
    const userOverrideKey = `override:user:${userId}`;
    if (experiment.config && experiment.config[userOverrideKey]) {
      return experiment.config[userOverrideKey];
    }

    // Check for attribute-based overrides
    // e.g., { "override:country:US": "variant-b" }
    if (experiment.config) {
      for (const [key, variantId] of Object.entries(experiment.config)) {
        if (key.startsWith('override:')) {
          const [, attrType, attrValue] = key.split(':');
          if (attrType && attrValue && userAttributes[attrType] === attrValue) {
            return variantId;
          }
        }
      }
    }

    return null;
  }

  /**
   * Evaluate targeting rules for a user.
   * Targeting rules determine if a user qualifies for an experiment.
   */
  _evaluateTargeting(experiment, userAttributes) {
    const targeting = experiment.targeting || {};

    // Country targeting
    if (targeting.countries && targeting.countries.length > 0) {
      const userCountry = userAttributes.country || userAttributes.countryCode;
      if (!userCountry || !targeting.countries.includes(userCountry)) {
        return false;
      }
    }

    // Percentage-based targeting (separate from traffic allocation)
    if (targeting.userPercent !== undefined) {
      const hash = crypto.createHash('md5').update(`targeting:${experiment.id}:${userAttributes.email || userAttributes.id || ''}`).digest('hex');
      const hashPercent = parseInt(hash.substring(0, 8), 16) % 100;
      if (hashPercent >= targeting.userPercent) {
        return false;
      }
    }

    // Minimum activity threshold
    if (targeting.minBookings !== undefined) {
      const userBookings = userAttributes.totalBookings || 0;
      if (userBookings < targeting.minBookings) {
        return false;
      }
    }

    // Date range targeting
    if (targeting.startDate) {
      if (new Date() < new Date(targeting.startDate)) {
        return false;
      }
    }
    if (targeting.endDate) {
      if (new Date() > new Date(targeting.endDate)) {
        return false;
      }
    }

    // Custom targeting rules
    if (targeting.customRules && Array.isArray(targeting.customRules)) {
      for (const rule of targeting.customRules) {
        if (!this._evaluateCustomRule(rule, userAttributes)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evaluate a single custom targeting rule.
   */
  _evaluateCustomRule(rule, userAttributes) {
    const { field, operator, value } = rule;
    const userValue = userAttributes[field];

    if (userValue === undefined) return false;

    switch (operator) {
      case 'eq':
        return userValue === value;
      case 'neq':
        return userValue !== value;
      case 'gt':
        return userValue > value;
      case 'gte':
        return userValue >= value;
      case 'lt':
        return userValue < value;
      case 'lte':
        return userValue <= value;
      case 'in':
        return Array.isArray(value) && value.includes(userValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(userValue);
      case 'contains':
        return String(userValue).includes(String(value));
      case 'regex':
        return new RegExp(value).test(String(userValue));
      default:
        return true;
    }
  }

  /**
   * Get assignment statistics for an experiment.
   */
  getAssignmentStats(experimentId) {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    const stats = {
      experimentId,
      experimentName: experiment.name,
      totalAssigned: experiment.assignments.size,
      variantDistribution: {},
    };

    for (const [userId, variantId] of experiment.assignments) {
      if (!stats.variantDistribution[variantId]) {
        stats.variantDistribution[variantId] = 0;
      }
      stats.variantDistribution[variantId]++;
    }

    // Calculate percentages
    const total = stats.totalAssigned;
    for (const [variantId, count] of Object.entries(stats.variantDistribution)) {
      stats.variantDistribution[variantId] = {
        count,
        percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(2)) : 0,
      };
    }

    return stats;
  }

  /**
   * Generate a deterministic user hash for consistent experiment bucketing.
   */
  generateUserHash(experimentId, userId) {
    return crypto.createHash('sha256').update(`${experimentId}:${userId}`).digest('hex');
  }

  /**
   * Set targeting rules for an experiment.
   */
  setTargeting(experimentId, targetingRules) {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    experiment.targeting = targetingRules;
    experiment.updatedAt = new Date();
    return experiment;
  }

  /**
   * Add an override for a specific user or attribute.
   */
  addOverride(experimentId, key, variantId) {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    if (!experiment.config) experiment.config = {};
    experiment.config[`override:${key}`] = variantId;
    experiment.updatedAt = new Date();
    return experiment;
  }

  /**
   * Remove an override.
   */
  removeOverride(experimentId, key) {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    if (experiment.config) {
      delete experiment.config[`override:${key}`];
    }
    return experiment;
  }
}

module.exports = { AssignmentService };