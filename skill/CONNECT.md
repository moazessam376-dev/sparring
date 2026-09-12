# Connect an agent

Sparring exposes one streamable HTTP MCP endpoint on loopback:

`http://127.0.0.1:<port>/mcp`

The server requires `Authorization: Bearer <token>` on every MCP request. Start the local server, read the chosen port from the state `port` file, read the bearer token from the state `token` file, and keep both values local. The application plan defines the default port as `4517`, upward scanning when occupied, loopback binding, origin validation, and token storage in `<state>/token`. Evidence: `docs/plans/2026-09-12-application.md`, Interfaces between rounds.

Replace `<port>` and `<token>` below. Keep any file containing a literal token outside version control.

## Claude Code

Verified against the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) on 2026-09-12. Claude Code accepts `type: "http"` for streamable HTTP and `headers` for bearer authentication. It also accepts `streamable-http` as a JSON alias for `http`.

Put this in project `.mcp.json`, or add the same server through `claude mcp add --transport http`:

    {
      "mcpServers": {
        "sparring": {
          "type": "http",
          "url": "http://127.0.0.1:<port>/mcp",
          "headers": {
            "Authorization": "Bearer <token>"
          }
        }
      }
    }

Verify with `claude mcp get sparring` or `/mcp`.

## Codex CLI

Verified against the [Codex MCP documentation](https://developers.openai.com/codex/mcp) on 2026-09-12. Codex CLI reads `~/.codex/config.toml` or a trusted project `.codex/config.toml`. The documented bearer-token field is `bearer_token_env_var`.

Export the token in the shell that launches Codex:

    export SPARRING_TOKEN='<token>'

Add this TOML table:

    [mcp_servers.sparring]
    url = "http://127.0.0.1:<port>/mcp"
    bearer_token_env_var = "SPARRING_TOKEN"

Verify with `codex mcp list`. The same MCP configuration is shared by Codex CLI and the Codex IDE extension according to the cited documentation.

## Cursor

Verified against the [Cursor MCP documentation](https://prod.cursor.com/help/customization/mcp) on 2026-09-12. Cursor reads project `.cursor/mcp.json` and global `~/.cursor/mcp.json`. The documented remote fields are `url` and `headers`, with the bearer value under `Authorization`.

Add this JSON:

    {
      "mcpServers": {
        "sparring": {
          "url": "http://127.0.0.1:<port>/mcp",
          "headers": {
            "Authorization": "Bearer <token>"
          }
        }
      }
    }

Restart Cursor and inspect MCP logs. The first-party page verifies the field spelling and bearer header. It does not establish environment-variable interpolation syntax for a plain `mcp.json`, so this example uses a literal placeholder rather than an unverified `${...}` form.

## OpenCode

Verified against the [OpenCode MCP documentation](https://opencode.ai/docs/mcp-servers/) on 2026-09-12. OpenCode uses `opencode.json`, puts servers under `mcp`, and uses `type: "remote"`, `url`, `enabled`, and `headers` for a remote server.

Add this JSON:

    {
      "$schema": "https://opencode.ai/config.json",
      "mcp": {
        "sparring": {
          "type": "remote",
          "url": "http://127.0.0.1:<port>/mcp",
          "enabled": true,
          "headers": {
            "Authorization": "Bearer <token>"
          }
        }
      }
    }

The first-party page verifies the remote field names and bearer header. It does not establish environment-variable interpolation syntax for `opencode.json`, so keep the literal-token file private.

## Devin CLI

Verified against the [Devin CLI MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration) on 2026-09-12. Current Devin CLI stores servers in `~/.config/devin/mcp_config.json`, `.devin/mcp_config.json`, or `.devin/mcp_config.local.json`, with `mcpServers` at the root. The documented remote fields are `url`, optional `transport: "http"`, and `headers`.

Add this JSON to the user file or the gitignored local file:

    {
      "mcpServers": {
        "sparring": {
          "url": "http://127.0.0.1:<port>/mcp",
          "transport": "http",
          "headers": {
            "Authorization": "Bearer <token>"
          }
        }
      }
    }

The CLI command `devin mcp add sparring http://127.0.0.1:<port>/mcp` verifies URL registration, but the cited command reference does not provide a bearer-header flag. Put the header in the config file. Verify with `devin mcp list` or `devin mcp get sparring`.

## Verification status

All five requested agent configuration spellings are verified against first-party documentation linked above. No agent configuration remains unverified. Cursor and OpenCode environment-variable interpolation in their plain config files remains unverified; the examples avoid that claim and use a literal token placeholder.

