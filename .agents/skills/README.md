# Agent skills

`create-formal-verification-skill` and `maintain-formal-verification-skill` are copied unchanged from [pstack](https://github.com/cursor/plugins/tree/35a90942a7f02e1ebbc2443643179815f2147954/pstack/skills) (`cursor/plugins` at `35a9094`), under the MIT license in `PSTACK-LICENSE`.

Start either one by typing its name as a slash command at the start of a prompt, for example `/create-formal-verification-skill`. Both set `disable-model-invocation: true`, so an agent cannot start them on its own.

Each skill lives in `.agents/skills/<name>/SKILL.md`. Claude Code reads `.claude/skills/`, so each skill also needs a symlink there: `ln -s ../../.agents/skills/<name> .claude/skills/<name>`. Skills that `/create-formal-verification-skill` generates follow the same layout.
