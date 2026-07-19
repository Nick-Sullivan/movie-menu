# the-movie-menu

## Environment

This project runs in WSL on Windows. The Claude Code shell does not have `~/.local/bin` on its PATH, so `mise` must be invoked via its full path:

```
/home/nick/.local/bin/mise <command>
```

For example:
- `/home/nick/.local/bin/mise install` — install all tools defined in `.mise/config.toml`
- `/home/nick/.local/bin/mise run <task>` — run a defined task
