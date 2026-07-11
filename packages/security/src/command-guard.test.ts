import { describe, it, expect } from 'vitest';
import { CommandGuard } from './command-guard.js';
import { DangerousOperations } from '@devcore/shared';

describe('CommandGuard', () => {
  describe('isDangerous', () => {
    it('returns true for dangerous commands', () => {
      for (const op of DangerousOperations) {
        expect(CommandGuard.isDangerous(`some-prefix ${op} some-suffix`)).toBe(true);
      }
    });

    it('returns false for safe commands', () => {
      expect(CommandGuard.isDangerous('ls -la')).toBe(false);
      expect(CommandGuard.isDangerous('npm run build')).toBe(false);
      expect(CommandGuard.isDangerous('git status')).toBe(false);
    });
    
    it('is case insensitive', () => {
      expect(CommandGuard.isDangerous('RM -RF /')).toBe(true);
    });
  });
});
