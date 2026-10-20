import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  license?: string;
  model_compatibility?: string[];
  [key: string]: any;
}

export interface LoadedSkill {
  slug: string;
  metadata: SkillMetadata;
  instructions: string;
  rawContent: string;
  filePath: string;
}

/**
 * Robust skill loader that scans /skills or reads specific SKILL.md files.
 * Uses js-yaml to parse YAML frontmatter and extracts raw markdown instructions.
 */
export function loadSkillBySlug(slug: string): LoadedSkill {
  const possiblePaths = [
    path.join(process.cwd(), 'skills', slug, 'SKILL.md'),
    path.join(process.cwd(), 'skills', `${slug}.md`),
    path.resolve('skills', slug, 'SKILL.md'),
  ];

  let filePath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    throw new Error(`SKILL.md not found for skill: "${slug}". Looked in: ${possiblePaths.join(', ')}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  return parseSkillMarkdown(rawContent, slug, filePath);
}

/**
 * Loads all skills located in the /skills directory.
 */
export function loadAllSkills(): LoadedSkill[] {
  const skillsDir = path.join(process.cwd(), 'skills');
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const loadedSkills: LoadedSkill[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        try {
          const raw = fs.readFileSync(skillFile, 'utf-8');
          loadedSkills.push(parseSkillMarkdown(raw, entry.name, skillFile));
        } catch (err) {
          console.error(`Failed to load skill in ${entry.name}:`, err);
        }
      }
    }
  }

  return loadedSkills;
}

/**
 * Parses markdown content with YAML frontmatter bounded by ---
 */
export function parseSkillMarkdown(rawContent: string, slug: string, filePath: string): LoadedSkill {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = rawContent.match(frontmatterRegex);

  let metadata: SkillMetadata = {
    name: slug,
    description: '',
  };
  let instructions = rawContent;

  if (match) {
    const yamlString = match[1];
    instructions = match[2].trim();

    try {
      const parsedYaml = yaml.load(yamlString) as Record<string, any>;
      if (parsedYaml && typeof parsedYaml === 'object') {
        metadata = {
          name: parsedYaml.name || slug,
          description: parsedYaml.description || '',
          version: parsedYaml.version,
          license: parsedYaml.license,
          model_compatibility: Array.isArray(parsedYaml.model_compatibility)
            ? parsedYaml.model_compatibility
            : undefined,
          ...parsedYaml,
        };
      }
    } catch (parseError) {
      console.warn(`[skill-loader] YAML parsing failed for ${slug}, using regex fallback:`, parseError);
      metadata = fallbackParseYaml(yamlString, slug);
    }
  }

  return {
    slug,
    metadata,
    instructions,
    rawContent,
    filePath,
  };
}

/**
 * Fallback regex-based parser in case YAML contains unexpected characters
 */
function fallbackParseYaml(yamlString: string, slug: string): SkillMetadata {
  const meta: SkillMetadata = { name: slug, description: '' };
  const lines = yamlString.split('\n');

  for (const line of lines) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) meta.name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) meta.description = descMatch[1].trim();

    const verMatch = line.match(/^version:\s*(.+)$/);
    if (verMatch) meta.version = verMatch[1].trim();

    const licMatch = line.match(/^license:\s*(.+)$/);
    if (licMatch) meta.license = licMatch[1].trim();
  }

  return meta;
}
