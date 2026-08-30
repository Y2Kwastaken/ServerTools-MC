# ServerTools

Modular server management plugin for Paper/Spigot. 120+ commands and features that replace a whole stack of plugins with one jar. Toggle anything off in the config, disabled modules don't even register their listeners.

Current version: **8.1.0** for MC **1.21.5** (Java 21).

[Spigot Page](https://www.spigotmc.org/resources/servertools-%E2%9E%9C-modular-server-management-1-8-1-21-open-source.95853/) | [Wiki](https://servertools.reece.sh/) | [Version History](https://www.spigotmc.org/resources/servertools-%E2%9E%9C-modular-server-management-1-8-1-21-open-source.95853/history)

Older servers: main branch is 1.18+ only. For 1.8 through 1.18.2 use the `ALL_1.8->1.18` branch or grab [6.4.9-all from Spigot](https://www.spigotmc.org/resources/servertools-%E2%9E%9C-modular-server-management-1-8-1-21-open-source.95853/download?version=455997).

## What's in it

- Core commands: fly, god, heal, repair, enchant, hat, invsee, enderchest, trash, speed, gamemode, tp, spawn, warps, messaging, nicknames
- Chat: format, emotes, cooldowns, join MOTD, mute chat, clear chat, chat/name color GUIs
- Moderation: freeze, reports, command spy, command protection, staff AFK, whitelist bypass
- Holograms, crates, vouchers, tags, daily rewards, launchpads
- Events: command aliases, custom death messages, anti-craft, xp bottles, money/exp withdraw, on-join commands, no bed explosions
- Auto announcements, scheduled tasks, PlaceholderAPI placeholders

Soft depends (all optional): LuckPerms, Vault, PlaceholderAPI, TAB, WorldGuard.

## Replaces

Holographic Displays, EssentialsSpawn, EssentialsChat, BeastWithdraw, ClearLagg, SimpleRename, HideStream, MuteChat/ClearChat, CommandAlias, auto announcement plugins, voucher plugins, launchpads, tags, chat/name color plugins, and a decent chunk of Essentials.

## Development

Needs Java 21, Maven, Docker, and [just](https://github.com/casey/just).

```bash
just build      # mvn package + copy jar to server/plugins/
just server-up  # paper server in docker (first run downloads everything)
just test-e2e   # e2e tests against the running server
just loadtest   # mineflayer bots for load testing
```

See [TESTING.md](TESTING.md) for load testing with bots and Spark profiling, and [INFRA.md](INFRA.md) for the local server setup.
