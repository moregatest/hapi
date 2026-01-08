# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is HAPI?

HAPI (哈皮) is a local-first alternative to Happy that enables remote control of Claude Code, Codex, and Gemini coding sessions. The architecture is designed for single-user self-hosting with minimal setup complexity.

**Key Design Philosophy**: Local-first architecture where data never leaves your machine. Unlike Happy's cloud-first approach with E2E encryption, HAPI uses a simpler tunnel-based model with TLS for transport security.

## Monorepo Structure

This is a Bun workspace with three main packages:

- `cli/` - CLI tool that wraps Claude Code and connects to the server
- `server/` - Socket.IO + REST API server with SQLite persistence
- `web/` - React PWA/Mini App for remote monitoring and control

All three can be bundled into a single executable with embedded web assets.

## Development Commands

### Building and Running

```bash
# Install dependencies (requires Bun >= 1.3.5)
bun install

# Development (runs server + web concurrently)
bun run dev

# Build all packages
bun run build

# Build single executable with embedded web assets
bun run build:single-exe

# Type checking
bun run typecheck

# Run tests
bun run test
```

### Individual Package Commands

```bash
# CLI development
cd cli && bun run dev

# Server development
cd server && bun run dev

# Web development
cd web && bun run dev

# CLI tests
cd cli && bun run test

# Server tests
cd server && bun run test
```

### Single Executable Build

The project supports bundling everything into a single binary:

```bash
bun run build:single-exe        # Current platform
bun run build:single-exe:all    # All platforms
```

This requires:
1. Web assets built first (`bun run build:web`)
2. Server generates embedded web assets (`cd server && bun run generate:embedded-web-assets`)
3. CLI builds executable with `--with-web-assets` flag

## Architecture Overview

### Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Local Machine                     │
│                                                             │
│  ┌──────────┐                ┌──────────┐                  │
│  │  CLI     │◄─ Socket.IO ──►│  Server  │                  │
│  │          │                 │          │                  │
│  │ - Claude │                 │ - REST   │                  │
│  │ - Codex  │                 │ - SSE    │                  │
│  │ - Gemini │                 │ - SQLite │                  │
│  └──────────┘                 └─────┬────┘                  │
│                                     │                       │
│                                     │ serves                │
│                                     ▼                       │
│                              ┌──────────┐                   │
│                              │   Web    │                   │
│                              │   App    │                   │
│                              └──────────┘                   │
└──────────────────────────────────┬──────────────────────────┘
                                   │
                    Optional: Cloudflare Tunnel / Tailscale
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │  Remote Clients          │
                    │  (Browser, Telegram)     │
                    └──────────────────────────┘
```

### Key Components

#### CLI (`cli/`)

**Purpose**: Wraps AI coding agents (Claude/Codex/Gemini) and connects them to the server for remote control.

**Architecture**:
- `src/claude/` - Claude Code integration via SDK and PTY-based interactive mode
- `src/codex/` - OpenAI Codex integration
- `src/agent/` - Multi-agent support (Gemini via ACP)
- `src/api/` - Socket.IO client for server communication
- `src/daemon/` - Background service management
- `src/modules/` - Tool implementations (ripgrep, difftastic, git)
- `src/terminal/` - Terminal multiplexer for remote shell access

**Dual Mode Operation**:
- **Local mode**: User controls agent via terminal
- **Remote mode**: Agent waits for messages from web/Telegram UI
- Mode switching is handled in `src/claude/loop.ts` via `runLocalRemoteLoop`

**Key Files**:
- `src/index.ts` - CLI entry point with command parsing
- `src/claude/loop.ts` - Main control loop managing local/remote modes
- `src/api/apiSession.ts` - WebSocket-based session client with RPC support
- `src/api/rpc/RpcHandlerManager.ts` - RPC handler registration and routing

#### Server (`server/`)

**Purpose**: Central communication hub with REST API, WebSocket server, and SQLite persistence.

**Architecture**:
- `src/web/` - Hono HTTP server with REST routes
- `src/socket/` - Socket.IO namespace handlers (CLI, web clients)
- `src/sync/syncEngine.ts` - Core session/message state manager with optimistic concurrency
- `src/store/` - SQLite persistence layer
- `src/telegram/` - Telegram bot integration (optional)
- `src/sse/` - Server-Sent Events for live web updates

**Key Concepts**:
- **Optimistic concurrency**: Sessions and agent state use version numbers to handle distributed updates
- **RPC routing**: Server routes RPC calls from web/Telegram to CLI via Socket.IO
- **Activity tracking**: Sessions auto-expire based on heartbeat timeout

**Key Files**:
- `src/index.ts` - Server startup, combines HTTP + Socket.IO + Telegram
- `src/sync/syncEngine.ts` - In-memory session cache, message pagination, RPC routing
- `src/socket/handlers/cli.ts` - CLI WebSocket event handlers
- `src/socket/rpcRegistry.ts` - RPC method registry

#### Web (`web/`)

**Purpose**: React PWA for monitoring sessions and remote control.

**Architecture**:
- React 19 + Vite
- TanStack Router for routing
- TanStack Query for data fetching
- @assistant-ui/react for chat interface
- Tailwind CSS for styling

**Authentication**:
- Telegram Mini App: Uses Telegram initData
- Browser: Uses CLI_API_TOKEN login
- JWT tokens with auto-refresh

**Real-time Updates**:
- SSE connection to `/api/events` for live updates
- Automatic cache invalidation on server events

**Key Files**:
- `src/router.tsx` - Route definitions
- `src/hooks/useSSE.ts` - Server-Sent Events integration
- `src/hooks/queries/` - TanStack Query hooks
- `src/components/SessionChat.tsx` - Chat interface with permission controls

## Critical Requirements

### Bun Version

**⚠️ CRITICAL**: Bun >= 1.3.5 is required for building executables.

The `bun:bundle` module (used for compile-time feature flags in executable builds) is only available in Bun 1.3.5+. Older versions will fail with "Cannot find package 'bundle'" error.

Check version: `bun --version`
Upgrade: `bun upgrade`

### Claude CLI

The `claude` command must be installed and authenticated for Claude Code sessions.

## Configuration

### Environment Variables

#### Required (for CLI + Server)
- `CLI_API_TOKEN` - Shared secret for authentication (auto-generated if not set on server)
- `HAPI_SERVER_URL` - Server URL (default: http://localhost:3006)

#### Optional (Telegram)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `ALLOWED_CHAT_IDS` - Comma-separated chat IDs
- `WEBAPP_URL` - Public HTTPS URL for Mini App

#### Optional (Other)
- `HAPI_HOME` - Data directory (default: ~/.hapi)
- `DB_PATH` - SQLite database path (default: $HAPI_HOME/hapi.db)
- `CORS_ORIGINS` - Comma-separated origins or `*`
- `HAPI_EXPERIMENTAL` - Enable experimental features

#### Optional (File Upload)
- `HAPI_ALLOWED_FILE_TYPES` - Comma-separated MIME types (default: images, PDF, text, JSON, ZIP)
- `HAPI_MAX_FILE_SIZE_MB` - Maximum file size in MB (default: 100, max: 1000)

### Storage Locations

All data is stored in `~/.hapi/` (or `$HAPI_HOME`):
- `settings.json` - User settings, machineId, token
- `daemon.state.json` - Daemon state (pid, port, version)
- `hapi.db` - SQLite database (sessions, messages, machines)
- `logs/` - Log files

## Key Architectural Patterns

### Session Management

Sessions flow through multiple layers:

1. **CLI creates session**: POST to `/cli/sessions` returns session object
2. **CLI connects via Socket.IO**: Namespace `/cli` with session-scoped auth
3. **Server manages state**: `syncEngine.ts` maintains in-memory cache + SQLite persistence
4. **Web receives updates**: SSE stream from `/api/events` with session/message events

### RPC (Remote Procedure Call)

Used for web/Telegram to call functions in the CLI:

1. **CLI registers handler**: `session.rpcHandlerManager.handle('method', handler)`
2. **Web calls RPC**: POST to `/api/sessions/:id/rpc/:method`
3. **Server routes**: Emits `rpc-request` via Socket.IO to CLI
4. **CLI executes**: Handler runs and returns response
5. **Server relays**: Response sent back to web via HTTP

Examples: git operations, file search, terminal control

### Permission System

Permissions are intercepted via MCP (Model Context Protocol):

1. **Claude requests tool use**: Captured by MCP permission server
2. **CLI stores request**: Sent to server in agent state
3. **User approves/denies**: Via web/Telegram UI
4. **CLI executes**: Based on permission mode (default, acceptEdits, bypass, plan)

### Message Flow

Messages follow a consistent pattern:

1. **Source**: User types in terminal (local) or web (remote)
2. **Transport**: Local messages go to Claude directly; remote messages via Socket.IO
3. **Storage**: Server persists all messages to SQLite
4. **Broadcast**: SSE notifies web clients of new messages
5. **Pagination**: Messages loaded in chunks (default 50 per page)

### Daemon Management

CLI can run as a background daemon:

- `hapi daemon start` - Starts detached process
- `hapi daemon stop` - Graceful shutdown
- State stored in `daemon.state.json` with PID, port, heartbeat
- Communicates with daemon via HTTP on localhost random port

## Development Tips

### Logging

CLI uses file-based logging to avoid interfering with terminal UI:
- Logs written to `~/.hapi/logs/YYYY-MM-DD-HH-MM-SS.log`
- Use `logger.debug()`, `logger.info()`, etc. (see `cli/src/ui/logger.ts`)
- View logs: `tail -f ~/.hapi/logs/*.log`

### Testing

Tests use Vitest with integration test environment:
- Configure via `.env.integration-test` in cli/
- Run: `bun run test` from root or `bun run test:cli` / `bun run test:server`
- No mocking - tests make real API calls

### Type Safety

Heavy use of Zod for runtime validation:
- `cli/src/api/types.ts` - API schemas
- `server/src/sync/syncEngine.ts` - Session/metadata schemas
- All Socket.IO events and HTTP requests validated with Zod

### Building for Release

Release process is automated via `cli/scripts/release-all.ts`:
1. Builds executables for all platforms
2. Creates npm packages with platform-specific binaries
3. Updates Homebrew formula
4. Publishes to npm and GitHub releases

## Related Documentation

- `docs/WHY_NOT_HAPPY.md` - Architectural comparison with Happy
- `cli/README.md` - CLI commands and configuration
- `server/README.md` - Server setup and API reference
- `web/README.md` - Web app features and development
- `docs/R2_SETUP_GUIDE.md` - Cloudflare R2 file upload setup

## Testing R2 File Upload

HAPI supports file uploads to Cloudflare R2 with 1-hour auto-expiration:

```bash
# Server configuration
export HAPI_R2_ACCOUNT_ID="your-account-id"
export HAPI_R2_ACCESS_KEY_ID="your-access-key"
export HAPI_R2_SECRET_ACCESS_KEY="your-secret-key"
export HAPI_R2_BUCKET_NAME="your-bucket-name"
export HAPI_R2_PUBLIC_BUCKET_URL="https://your-bucket.r2.dev"

# Start server
bun run dev:server

# Upload a file (requires running session)
curl -X POST http://localhost:3006/api/sessions/SESSION_ID/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/file.png"
```

Files are automatically deleted after 1 hour using R2 lifecycle rules.
