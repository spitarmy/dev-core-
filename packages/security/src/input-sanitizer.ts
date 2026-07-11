/**
 * Input sanitization utilities for user input, shell arguments, and file uploads.
 * @module input-sanitizer
 */

/**
 * Provides static methods for sanitizing user input, shell arguments,
 * filenames, and validating file uploads.
 *
 * All methods are stateless and can be called without instantiation.
 */
export class InputSanitizer {
  /** Maximum allowed length for user input strings. */
  static readonly MAX_INPUT_LENGTH = 10_000;

  /** Maximum allowed file size in bytes (10 MB). */
  static readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  /** File extensions that are permitted for upload. */
  static readonly ALLOWED_EXTENSIONS: readonly string[] = [
    '.ts', '.js', '.mjs', '.cjs', '.json', '.md', '.txt',
    '.yaml', '.yml', '.toml', '.css', '.scss', '.html',
    '.jsx', '.tsx', '.vue', '.svelte', '.sql', '.graphql',
    '.prisma', '.env.example',
  ];

  /** File extensions that are always rejected. */
  static readonly DENIED_EXTENSIONS: readonly string[] = [
    '.exe', '.sh', '.bat', '.cmd', '.ps1', '.msi',
    '.dll', '.so', '.dylib', '.bin', '.com', '.scr',
  ];

  /**
   * Sanitizes raw user input by trimming, truncating, and removing
   * dangerous characters.
   *
   * Processing steps:
   * 1. Trim leading/trailing whitespace
   * 2. Truncate to {@link MAX_INPUT_LENGTH}
   * 3. Remove null bytes (`\0`)
   * 4. Remove control characters (preserving `\n`, `\r`, `\t`)
   * 5. Normalize Unicode to NFC form
   *
   * @param input - The raw user input string.
   * @returns The sanitized input string.
   */
  static sanitizeUserInput(input: string): string {
    let sanitized = input.trim();

    // Limit length
    if (sanitized.length > InputSanitizer.MAX_INPUT_LENGTH) {
      sanitized = sanitized.slice(0, InputSanitizer.MAX_INPUT_LENGTH);
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters except \n \r \t
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize unicode to NFC
    sanitized = sanitized.normalize('NFC');

    return sanitized;
  }

  /**
   * Escapes a string for safe use in shell commands and wraps it in single quotes.
   *
   * Escapes the following characters: `'`, `"`, `\`, `` ` ``, `$`, `!`, `&`,
   * `|`, `;`, `(`, `)`, `<`, `>`, `*`, `?`, `[`, `]`, `{`, `}`, `~`, `#`.
   *
   * @param input - The string to escape for shell usage.
   * @returns The escaped string wrapped in single quotes.
   */
  static sanitizeForShell(input: string): string {
    const escaped = input.replace(/(['"\\`$!&|;()<>*?[\]{}~#])/g, '\\$1');
    return `'${escaped}'`;
  }

  /**
   * Validates a file upload against size limits, allowed/denied extensions,
   * and double-extension attacks.
   *
   * @param file - The file metadata to validate.
   * @param file.name - The filename including extension.
   * @param file.size - The file size in bytes.
   * @param file.mimeType - The MIME type of the file.
   * @returns An object indicating whether the file is valid, with an optional reason on failure.
   */
  static validateFileUpload(file: {
    name: string;
    size: number;
    mimeType: string;
  }): { valid: boolean; reason?: string } {
    // Check file size
    if (file.size > InputSanitizer.MAX_FILE_SIZE) {
      return {
        valid: false,
        reason: `File size ${file.size} exceeds maximum allowed size of ${InputSanitizer.MAX_FILE_SIZE} bytes`,
      };
    }

    const lowerName = file.name.toLowerCase();

    // Check denied extensions
    for (const denied of InputSanitizer.DENIED_EXTENSIONS) {
      if (lowerName.endsWith(denied)) {
        return {
          valid: false,
          reason: `File extension '${denied}' is not allowed`,
        };
      }
    }

    // Check for double extensions (e.g., .js.exe)
    const parts = lowerName.split('.');
    if (parts.length > 2) {
      const lastExt = `.${parts[parts.length - 1]!}`;
      const secondLastExt = `.${parts[parts.length - 2]!}`;
      for (const denied of InputSanitizer.DENIED_EXTENSIONS) {
        if (lastExt === denied || secondLastExt === denied) {
          return {
            valid: false,
            reason: `Suspicious double extension detected in '${file.name}'`,
          };
        }
      }
    }

    // Check allowed extensions
    const hasAllowedExt = InputSanitizer.ALLOWED_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext),
    );

    if (!hasAllowedExt) {
      return {
        valid: false,
        reason: `File extension is not in the allowed list`,
      };
    }

    return { valid: true };
  }

  /**
   * Sanitizes a filename for safe filesystem storage.
   *
   * Processing steps:
   * 1. Remove path separators (`/` and `\`)
   * 2. Remove null bytes and control characters
   * 3. Replace spaces with hyphens
   * 4. Convert to lowercase
   * 5. Truncate to 255 characters
   *
   * @param filename - The raw filename to sanitize.
   * @returns The sanitized filename string.
   */
  static sanitizeFilename(filename: string): string {
    let sanitized = filename;

    // Remove path separators
    sanitized = sanitized.replace(/[/\\]/g, '');

    // Remove null bytes and control characters
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    // Replace spaces with hyphens
    sanitized = sanitized.replace(/\s+/g, '-');

    // Lowercase
    sanitized = sanitized.toLowerCase();

    // Limit to 255 chars
    if (sanitized.length > 255) {
      sanitized = sanitized.slice(0, 255);
    }

    return sanitized;
  }
}
