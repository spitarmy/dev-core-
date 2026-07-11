/**
 * @module @devcore/shared/utils/validation
 * Input validation and sanitization utilities for the DevCore platform.
 * Provides functions for validating identifiers, sanitizing user input,
 * validating email addresses, checking filesystem paths, and performing
 * runtime type guards on configuration objects.
 */

import { AIProvider, ModelRole } from '../types/model.js';
import type { ModelConfig } from '../types/model.js';

/**
 * Regular expression pattern for validating UUID v4 format strings.
 * Matches the standard 8-4-4-4-12 hexadecimal format with version 4 identifier.
 *
 * @example
 * ```typescript
 * UUID_V4_REGEX.test('550e8400-e29b-41d4-a716-446655440000'); // true
 * UUID_V4_REGEX.test('not-a-uuid'); // false
 * ```
 */
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a valid UUID v4 format task identifier.
 *
 * @param id - The string to validate.
 * @returns `true` if the string matches UUID v4 format, `false` otherwise.
 *
 * @example
 * ```typescript
 * isValidTaskId('550e8400-e29b-41d4-a716-446655440000'); // true
 * isValidTaskId('12345'); // false
 * isValidTaskId(''); // false
 * ```
 */
export function isValidTaskId(id: string): boolean {
  return UUID_V4_REGEX.test(id);
}

/**
 * Sanitizes a string input by performing the following operations:
 * 1. Trims leading and trailing whitespace.
 * 2. Removes null bytes (`\0`).
 * 3. Removes ASCII control characters (0x00–0x1F, 0x7F), except for
 *    newline (`\n`), carriage return (`\r`), and tab (`\t`).
 * 4. Normalizes consecutive whitespace characters to a single space.
 *
 * @param input - The raw string to sanitize.
 * @returns The sanitized string.
 *
 * @example
 * ```typescript
 * sanitizeString('  hello\0world  ');        // 'hello world'
 * sanitizeString('foo\x01bar\x02baz');       // 'foobarbaz'
 * sanitizeString('too   many    spaces');     // 'too many spaces'
 * ```
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Validates whether a string is a syntactically valid email address.
 * Uses a basic validation pattern that checks for the presence of
 * a local part, `@` symbol, domain name, and top-level domain.
 *
 * @param email - The email address string to validate.
 * @returns `true` if the string matches basic email format, `false` otherwise.
 *
 * @example
 * ```typescript
 * validateEmail('user@example.com');    // true
 * validateEmail('user@sub.domain.co'); // true
 * validateEmail('invalid');             // false
 * validateEmail('@missing-local.com'); // false
 * ```
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates whether a filesystem path is safe for use by AI agents.
 * Rejects paths that contain path traversal sequences (`..`) or null bytes,
 * which could be used to escape sandbox boundaries.
 *
 * @param path - The filesystem path to validate.
 * @returns `true` if the path is safe, `false` if it contains dangerous patterns.
 *
 * @example
 * ```typescript
 * isValidPath('/home/user/project/src'); // true
 * isValidPath('./relative/path');         // true
 * isValidPath('../escape/attempt');       // false
 * isValidPath('/path/with/\0/null');      // false
 * isValidPath('');                        // false
 * ```
 */
export function isValidPath(path: string): boolean {
  if (!path || path.length === 0) {
    return false;
  }
  if (path.includes('\0')) {
    return false;
  }
  if (path.includes('..')) {
    return false;
  }
  return true;
}

/**
 * Runtime type guard that validates whether an unknown value conforms to
 * the {@link ModelConfig} interface. Checks that all required fields are
 * present and have the correct types, including enum membership for
 * `provider` and `role`.
 *
 * @param config - The unknown value to validate.
 * @returns `true` if the value is a valid `ModelConfig`, narrowing the type.
 *
 * @example
 * ```typescript
 * const input: unknown = JSON.parse(userInput);
 * if (validateModelConfig(input)) {
 *   // input is now typed as ModelConfig
 *   console.log(input.provider, input.modelId);
 * }
 * ```
 */
export function validateModelConfig(config: unknown): config is ModelConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const obj = config as Record<string, unknown>;

  /** Check that provider is a valid AIProvider enum value. */
  if (
    typeof obj['provider'] !== 'string' ||
    !Object.values(AIProvider).includes(obj['provider'] as AIProvider)
  ) {
    return false;
  }

  /** Check that modelId is a non-empty string. */
  if (typeof obj['modelId'] !== 'string' || obj['modelId'].length === 0) {
    return false;
  }

  /** Check that role is a valid ModelRole enum value. */
  if (
    typeof obj['role'] !== 'string' ||
    !Object.values(ModelRole).includes(obj['role'] as ModelRole)
  ) {
    return false;
  }

  /** Check that numeric fields are finite numbers. */
  if (typeof obj['maxTokens'] !== 'number' || !Number.isFinite(obj['maxTokens'])) {
    return false;
  }

  if (typeof obj['temperature'] !== 'number' || !Number.isFinite(obj['temperature'])) {
    return false;
  }

  if (
    typeof obj['costPerInputToken'] !== 'number' ||
    !Number.isFinite(obj['costPerInputToken'])
  ) {
    return false;
  }

  if (
    typeof obj['costPerOutputToken'] !== 'number' ||
    !Number.isFinite(obj['costPerOutputToken'])
  ) {
    return false;
  }

  return true;
}
