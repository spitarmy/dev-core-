import { describe, it, expect } from 'vitest';
import { calculateTokenCost, formatCost, isWithinBudget, estimateTaskCost } from './cost.js';
import { ModelRole, DEFAULT_MODEL_CONFIG } from '../types/model.js';

describe('cost utils', () => {
  describe('calculateTokenCost', () => {
    it('calculates cost based on model config', () => {
      const config = {
        ...DEFAULT_MODEL_CONFIG[ModelRole.PLANNER],
        costPerInputToken: 0.000005,
        costPerOutputToken: 0.00003,
      };
      
      const cost = calculateTokenCost(1000, 500, config);
      expect(cost).toBe(1000 * 0.000005 + 500 * 0.00003); // 0.005 + 0.015 = 0.02
    });
  });

  describe('formatCost', () => {
    it('formats small costs with 4 decimal places', () => {
      expect(formatCost(0.0023)).toBe('$0.0023');
    });

    it('formats large costs with 2 decimal places', () => {
      expect(formatCost(1.5)).toBe('$1.50');
    });

    it('supports different currencies', () => {
      expect(formatCost(0.005, 'EUR').replace(/\s/g, '')).toMatch(/€0.0050/);
    });
  });

  describe('isWithinBudget', () => {
    it('returns true when cost is below limit', () => {
      expect(isWithinBudget(3.50, 5.00)).toBe(true);
    });

    it('returns true when cost is exactly limit', () => {
      expect(isWithinBudget(5.00, 5.00)).toBe(true);
    });

    it('returns false when cost exceeds limit', () => {
      expect(isWithinBudget(5.01, 5.00)).toBe(false);
    });
  });

  describe('estimateTaskCost', () => {
    it('estimates cost based on task description length', () => {
      const desc = 'a'.repeat(400); // 100 tokens + 500 overhead = 600 tokens
      const estimate = estimateTaskCost(desc, ModelRole.IMPLEMENTER);
      
      expect(estimate.inputTokens).toBe(600);
      expect(estimate.outputTokens).toBe(Math.ceil(600 * 0.6)); // 360
      expect(estimate.currency).toBe('USD');
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });
  });
});
