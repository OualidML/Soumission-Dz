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
 * INTERNAL HELPER: Parses markdown content with YAML frontmatter
 */
function parseSkillMarkdown(rawContent: string, slug: string, filePath: string): LoadedSkill {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = rawContent.match(frontmatterRegex);

  let metadata: SkillMetadata = { name: slug, description: '' };
  let instructions = rawContent;

  if (match) {
    const yamlString = match[1];
    instructions = match[2].trim();
    try {
      const parsedYaml = yaml.load(yamlString) as Record<string, any>;
      if (parsedYaml && typeof parsedYaml === 'object') {
        metadata = { ...parsedYaml, name: parsedYaml.name || slug, description: parsedYaml.description || '' };
      }
    } catch {
      const lines = yamlString.split('\n');
      for (const line of lines) {
        const nameMatch = line.match(/^name:\s*(.+)$/);
        if (nameMatch) metadata.name = nameMatch[1].trim();
        const descMatch = line.match(/^description:\s*(.+)$/);
        if (descMatch) metadata.description = descMatch[1].trim();
      }
    }
  }

  return { slug, metadata, instructions, rawContent, filePath };
}

/**
 * EXPORTED LOADER OBJECT
 * This is what the route.ts uses: skillLoader.loadAllSkills()
 */
export const skillLoader = {
  loadSkillBySlug(slug: string): LoadedSkill {
    const possiblePaths = [
      path.join(process.cwd(), 'skills', slug, 'SKILL.md'),
      path.join(process.cwd(), 'skills', `${slug}.md`),
    ];
    let filePath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) { filePath = p; break; }
    }
    if (!filePath) throw new Error(`SKILL.md not found for skill: "${slug}"`);
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    return parseSkillMarkdown(rawContent, slug, filePath);
  },

  loadAllSkills(): LoadedSkill[] {
    const skillsDir = path.join(process.cwd(), 'skills');
    if (!fs.existsSync(skillsDir)) return [];
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const loadedSkills: LoadedSkill[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          try {
            const raw = fs.readFileSync(skillFile, 'utf-8');
            loadedSkills.push(parseSkillMarkdown(raw, entry.name, skillFile));
          } catch (err) { console.error(`Failed to load skill in ${entry.name}:`, err); }
        }
      }
    }
    return loadedSkills;
  }
};