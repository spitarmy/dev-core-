import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** YAML-like frontmatter parsed from a SKILL.md file. */
export interface SkillFrontmatter {
  /** Human-readable name of the skill. */
  name: string;
  /** Short description used for trigger-matching. */
  description: string;
  /** Additional frontmatter fields. */
  [key: string]: unknown;
}

/** Options passed when running a skill. */
export interface SkillRunOptions {
  /** Key-value arguments forwarded to the skill. */
  args?: Record<string, string>;
  /** When `true`, the skill is parsed but not executed. */
  dryRun?: boolean;
}

/** The result of running (loading) a skill. */
export interface SkillRunResult {
  /** Name of the skill that was run. */
  skillName: string;
  /** Body content of SKILL.md (without frontmatter). */
  content: string;
  /** Parsed frontmatter metadata. */
  frontmatter: SkillFrontmatter;
  /** Absolute path to the SKILL.md file. */
  path: string;
}

/** Summary information about an available skill. */
export interface SkillInfo {
  /** Human-readable skill name. */
  name: string;
  /** Short description of the skill. */
  description: string;
  /** Absolute path to the skill directory. */
  path: string;
}

/**
 * Discovers and loads skills from the `.agents/skills/` directory.
 *
 * Skills are directories containing a `SKILL.md` file with YAML-like
 * frontmatter (`name`, `description`) and a Markdown body of instructions.
 */
export class SkillRunner {
  private readonly skillsBasePath: string;

  /**
   * Creates a new SkillRunner instance.
   * @param workspaceRoot - Absolute path to the workspace root directory.
   */
  constructor(workspaceRoot: string) {
    this.skillsBasePath = join(workspaceRoot, '.agents', 'skills');
  }

  /**
   * Loads and parses a skill by name.
   *
   * Reads the `SKILL.md` file from `.agents/skills/{skillName}/`,
   * extracts the frontmatter and body, and returns them as a
   * {@link SkillRunResult}.
   *
   * @param skillName - Directory name of the skill to load.
   * @param _options  - Optional run configuration (reserved for future use).
   * @returns The parsed skill result.
   * @throws If the skill directory or `SKILL.md` file does not exist.
   */
  async runSkill(
    skillName: string,
    _options?: SkillRunOptions,
  ): Promise<SkillRunResult> {
    const skillPath = join(this.skillsBasePath, skillName, 'SKILL.md');

    let raw: string;
    try {
      raw = await readFile(skillPath, 'utf-8');
    } catch {
      throw new Error(
        `Skill "${skillName}" not found at ${skillPath}`,
      );
    }

    const { frontmatter, body } = this.parseFrontmatter(raw);

    return {
      skillName,
      content: body,
      frontmatter,
      path: skillPath,
    };
  }

  /**
   * Lists all available skills in the `.agents/skills/` directory.
   *
   * Scans for subdirectories containing a valid `SKILL.md` file and
   * returns their metadata sorted alphabetically by name.
   *
   * @returns An array of {@link SkillInfo} objects, or an empty array
   *          if the skills directory does not exist.
   */
  async listSkills(): Promise<SkillInfo[]> {
    let entries: string[];
    try {
      const dirEntries = await readdir(this.skillsBasePath, {
        withFileTypes: true,
      });
      entries = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }

    const skills: SkillInfo[] = [];

    for (const entry of entries) {
      try {
        const skillPath = join(this.skillsBasePath, entry, 'SKILL.md');
        const raw = await readFile(skillPath, 'utf-8');
        const { frontmatter } = this.parseFrontmatter(raw);

        skills.push({
          name: frontmatter.name || entry,
          description: frontmatter.description || '',
          path: join(this.skillsBasePath, entry),
        });
      } catch {
        // Skip directories without a valid SKILL.md
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Returns the absolute path to a skill directory.
   *
   * @param skillName - Directory name of the skill.
   * @returns The absolute path to the skill directory.
   */
  getSkillPath(skillName: string): string {
    return join(this.skillsBasePath, skillName);
  }

  /**
   * Parses YAML-like frontmatter from a Markdown string.
   *
   * Frontmatter is delimited by `---` lines at the start of the file.
   * Each line within the block is parsed as a simple `key: value` pair.
   *
   * @param content - Raw Markdown content with optional frontmatter.
   * @returns An object containing the parsed {@link SkillFrontmatter}
   *          and the remaining Markdown body.
   */
  parseFrontmatter(content: string): {
    frontmatter: SkillFrontmatter;
    body: string;
  } {
    const defaultFrontmatter: SkillFrontmatter = {
      name: '',
      description: '',
    };

    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---')) {
      return { frontmatter: defaultFrontmatter, body: content };
    }

    const endIndex = trimmed.indexOf('---', 3);
    if (endIndex === -1) {
      return { frontmatter: defaultFrontmatter, body: content };
    }

    const frontmatterBlock = trimmed.slice(3, endIndex).trim();
    const body = trimmed.slice(endIndex + 3).trimStart();

    const frontmatter: SkillFrontmatter = { name: '', description: '' };

    for (const line of frontmatterBlock.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value: string = line.slice(colonIndex + 1).trim();

      // Strip surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      frontmatter[key] = value;
    }

    return { frontmatter, body };
  }
}
