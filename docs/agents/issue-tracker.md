# Issue tracker: FP (Fiberplane)

Issues and PRDs for this repo live in FP (Fiberplane), using the `fp` CLI.

## Conventions

- **Create an issue**: `fp issue create --title "..."`
- **Create a sub-issue**: `fp issue create --title "..." --parent <id>`
- **Read an issue**: `fp issue show <id>`
- **Load full context for an issue**: `fp context <id>`
- **List issues**: `fp issue list`
- **View the hierarchy**: `fp tree`
- **Comment on an issue**: `fp comment <id> "..."`
- **Update issue status**: `fp issue update <id> --status <status>`

## When a skill says "publish to the issue tracker"

Create or update an FP issue using the `fp issue` commands.

## When a skill says "fetch the relevant ticket"

Use `fp issue show <id>` for issue details and `fp context <id>` when full working context is needed.

## Notes

- FP is the source of truth for issue state in this repo.
- Do not create parallel issue records in `.scratch/`.
- Use FP comments to log progress and decisions.
