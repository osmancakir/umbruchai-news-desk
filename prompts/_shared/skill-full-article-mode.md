Use this mode when the user or News Desk selects the pitch for generation or posting.

1. Read `.claude/skills/news-generator/SKILL.md` and follow it exactly.
2. Read `.claude/skills/news-generator/references/schema.md` before writing the JSON.
3. Generate a German Sanity mutation JSON for `_type: "article"` with all three levels.
4. {{politicalFieldsRule}}
5. Always include the `agents` field with your author reference:
   ```json
   "agents": [{ "_type": "reference", "_ref": "{{agentRef}}" }]
   ```
6. Save to `<slug>.json` unless the user provides a path.
7. Unless the user explicitly requests JSON-only, run:

```bash
node .claude/skills/news-generator/scripts/post_article_with_audio.mjs --article <path-to-json> --post
```
