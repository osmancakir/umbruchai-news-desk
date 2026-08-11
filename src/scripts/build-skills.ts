/**
 * Renders the Agent Skills under /skills from the shared prose in /prompts.
 *
 * The journalist SKILL.md files and the LangGraph system prompts describe the same
 * five personas. Both are composed from prompts/<journalist-id>/{persona,beat,research}.md
 * so the two paths cannot drift apart.
 *
 *   npm run build:skills    write the SKILL.md files
 *   npm run check:skills    fail if any checked-in SKILL.md is stale
 *
 * Skills are copied into .claude/skills/ to be used, so they are generated as
 * self-contained files rather than referencing prompts/ at read time.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { JOURNALIST_PROFILES, readJournalistFragments } from '../personas.js'
import { PROMPTS_DIR, readPrompt, render, renderPrompt } from '../prompts.js'

const SKILLS_DIR = resolve(PROMPTS_DIR, '..', 'skills')

const POLITICAL_FIELDS_RULE = {
  political:
    'Include top-level `leaning` and `agencyLevel`, plus political `humanConcern` and `opposingView` commentary for every level.',
  nonPolitical: 'Omit top-level `leaning` and `agencyLevel`; omit political commentary fields.',
}

interface GeneratedSkill {
  skillDir: string
  templateRelativePath: string
  content: string
}

/** Marks the output as generated, just below the frontmatter block. */
function withBanner(content: string, templateRelativePath: string): string {
  const banner = `<!-- Generated from prompts/${templateRelativePath} by \`npm run build:skills\`. Do not edit directly. -->`
  const frontmatter = content.match(/^---\n[\s\S]*?\n---\n/)
  if (!frontmatter) return `${banner}\n\n${content}`
  return `${frontmatter[0]}\n${banner}\n${content.slice(frontmatter[0].length)}`
}

function renderSkill(skillDir: string, vars: Record<string, string>): GeneratedSkill {
  const templateRelativePath = join('skills', `${skillDir}.md`)
  const rendered = render(readPrompt(templateRelativePath), vars, templateRelativePath)
  return {
    skillDir,
    templateRelativePath,
    content: `${withBanner(rendered, templateRelativePath).trimEnd()}\n`,
  }
}

function renderJournalistSkills(): GeneratedSkill[] {
  return Object.values(JOURNALIST_PROFILES).map((profile) => {
    const { persona, beat, research } = readJournalistFragments(profile)

    const fullArticleMode = renderPrompt('_shared/skill-full-article-mode.md', {
      agentRef: profile.agentRef,
      politicalFieldsRule: profile.isPolitical
        ? POLITICAL_FIELDS_RULE.political
        : POLITICAL_FIELDS_RULE.nonPolitical,
    })

    return renderSkill(profile.skillDir, { persona, beat, research, fullArticleMode })
  })
}

function renderEditorSkill(): GeneratedSkill {
  const profiles = Object.values(JOURNALIST_PROFILES)

  return renderSkill('news-desk-editor-agent', {
    roster: profiles.map((p) => `- \`${p.skillDir}\`: ${p.beatSummary}`).join('\n'),
    skillPaths: profiles
      .map((p) => `- ${p.shortLabel}: \`.claude/skills/${p.skillDir}/SKILL.md\``)
      .join('\n'),
  })
}

function main(): void {
  const check = process.argv.includes('--check')
  const skills = [...renderJournalistSkills(), renderEditorSkill()]
  const stale: string[] = []

  for (const skill of skills) {
    const outputPath = join(SKILLS_DIR, skill.skillDir, 'SKILL.md')
    const current = (() => {
      try {
        return readFileSync(outputPath, 'utf8')
      } catch {
        return null
      }
    })()

    if (current === skill.content) {
      if (!check) console.log(`  unchanged  skills/${skill.skillDir}/SKILL.md`)
      continue
    }

    if (check) {
      stale.push(`skills/${skill.skillDir}/SKILL.md`)
      continue
    }

    writeFileSync(outputPath, skill.content, 'utf8')
    console.log(`  ${current === null ? 'created' : 'updated'}    skills/${skill.skillDir}/SKILL.md`)
  }

  if (check && stale.length > 0) {
    console.error(
      `\n✗ ${stale.length} SKILL.md file(s) are out of date with prompts/:\n${stale
        .map((f) => `  - ${f}`)
        .join('\n')}\n\nRun \`npm run build:skills\` and commit the result.`,
    )
    process.exit(1)
  }

  console.log(check ? '\n✓ All SKILL.md files are up to date.' : `\n✓ Rendered ${skills.length} skills.`)
}

main()
