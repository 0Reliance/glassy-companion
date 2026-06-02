# Glassy MCP Strategy: Concrete Recommendations from Cutting-Edge Use Cases

## Executive Summary

The original recommendation is architecturally sound and well-grounded. This report validates it against the live state of the MCP ecosystem as of mid-2026, identifies the specific patterns that are gaining the most traction, and translates them into concrete, file-level implementation tasks ranked by impact-to-effort. The core thesis — that Glassy should become a self-hosted MCP knowledge server, combining RAG over a user's personal corpus with action-oriented MCP tools — maps precisely onto what the most-praised open-source projects in the MCP space are doing right now. The infrastructure gap is narrower than it looks: `bookmarkEmbeddingService.js` already ships cosine-similarity semantic search over bookmarks, the embedding pipeline exists, and both `obsidian.js` and `captureRoutes.js` represent first-class corpus sources that are one indexer away from being queryable.

***

## The MCP Landscape in 2026: What's Actually Working

MCP was donated to the Linux Foundation in December 2025 and is now backed by Google, OpenAI, and Anthropic simultaneously — it has crossed from "Anthropic experiment" to industry standard. The Docker MCP Catalog hosts 270+ servers, and GitHub's MCP Registry went live in September 2025. There are now over 10,000 MCP servers indexed across directories, but the ones receiving the most sustained use fall into a small number of patterns.[^1][^2]

The dominant use-case clusters for personal and productivity MCP servers in 2026 are:

- **Persistent memory / knowledge graph** — SQLite-backed servers that let AI assistants remember facts, relationships, and decisions across sessions. The leading open-source example is a single-file SQLite MCP with 13 tools for session tracking, knowledge graph management, text search, and duplicate detection.[^3]
- **Hybrid RAG-as-MCP** — exposing a personal document corpus (notes, bookmarks, vault) as an MCP `search` tool rather than a standalone app. The community consensus on Reddit's r/mcp is: "The best way to build a RAG in 2026 is to expose it as an MCP server". When the retrieval endpoint is MCP-native, any AI client — Claude Desktop, Cursor, Windsurf — can call it without additional integration work.[^4]
- **Vault/second-brain bridging** — Obsidian-specific MCP servers have emerged as a distinct category. The most technically sophisticated one published in May 2026 uses BM25 + trigram fuzzy matching + vector embeddings fused with Reciprocal Rank Fusion (RRF), all stored in a single SQLite database, offline, with no API key required. This is the state of the art for vault search, and it directly overlaps with Glassy's Obsidian integration.[^5]
- **Browser-to-memory pipeline** — Projects like the Chrome MCP Server expose tab history and page content to AI agents. The screenpipe project (YC S26, 18,000+ GitHub stars) continuously records screen + audio, stores everything in SQLite locally, and exposes it as an MCP server. Glassy Companion's capture pipeline is already doing this intentionally and selectively — which is strictly better than indiscriminate recording.[^6][^7][^8][^9]
- **Bookmark manager + AI MCP** — Recall (a PKM tool) gained significant traction in 2026 specifically by exposing a user's saved content as an MCP server so AI tools could reference trusted sources rather than generic search results. Pocket shut down in July 2025 and MarkDownload was removed from the Chrome Web Store — the market for a capable self-hosted web clipper with AI + MCP integration is wide open.[^10][^11]

The architectural consensus from production teams is to combine RAG and MCP rather than choose between them: RAG handles semantic retrieval over long-form text, MCP handles actions and live system interaction, and the hybrid covers the vast majority of real workflows. For Glassy, the practical translation is: the KB query endpoint is a RAG system exposed *as* an MCP tool — the distinction collapses.[^12][^13]

***

## What the Codebase Already Has (Honest Assessment)

Inspecting the live repository confirms several critical pieces are further along than the original recommendation implied:

| Component | Status | Location |
|---|---|---|
| Embedding generation | ✅ Live, `gemini-embedding-001` | `server/services/bookmarkEmbeddingService.js` |
| Cosine similarity scoring | ✅ Custom `cosineSimilarity` util | `server/utils/mathUtils.js` |
| Bookmark semantic search | ✅ Full `semanticSearchBookmarks()` | `server/services/bookmarkEmbeddingService.js` |
| Capture ingestion pipeline | ✅ Production, 8 presets | `server/routes/captureRoutes.js` |
| Obsidian vault sync routes | ✅ 59KB route file | `server/routes/obsidian.js` |
| Notes corpus | ✅ 35KB route file | `server/routes/notes.js` |
| AI cost cap | ✅ Gates 13 cloud routes | `server/services/aiCostCap.js` |
| Rule engine | ✅ Domain/URL routing | `server/services/ruleEngine.js` |

The critical gap is that `bookmarkEmbeddingService.js` only covers bookmarks. Notes, Obsidian vault files, and voice transcriptions are not yet in the embedding index. The second gap is that there is no unified query surface — no single `POST /api/kb/query` endpoint that searches across all corpora simultaneously. Both gaps are tractable with incremental work.

***

## Concrete Recommendation 1: Unified Corpus Indexer

**What to build:** `server/services/corpusIndexer.js` — extend the existing bookmark embedding pattern to cover all content types.

**Why now:** The bookmark embedding service proves the pattern works end-to-end. The call signature is already defined: `generateAndStoreBookmarkEmbedding(id, userId, accountId)`. The notes corpus needs an identical `generateAndStoreNoteEmbedding()` function pulling from `server/routes/notes.js`, and the Obsidian vault files need a `generateAndStoreVaultEmbedding()` that hooks into the sync events already firing in `server/routes/obsidian.js`.

**Migration:** Add a `content_embeddings` table in migration `~0070` with columns `(id, source_type, source_id, user_id, account_id, chunk_index, chunk_text, embedding_vector, model, created_at)`. The `source_type` enum covers `bookmark`, `note`, `vault_file`, `voice_transcript`. This replaces the bookmark-specific `bookmark_embeddings` table as the unified store, or the two can coexist while the new table grows.

**Chunking strategy:** For notes and vault files longer than ~800 tokens, use paragraph-boundary chunking with 10-20% overlap — this is the production recommendation from 2026 RAG architecture guides. Bookmarks are typically short enough to embed as a single chunk; the current implementation already handles this correctly.[^14]

**Trigger points:**
- Hook into the existing TanStack Query invalidation pattern on note save/update
- Hook into `obsidian.js` vault push events
- Run a one-time backfill job at server startup for any notes/vault files without embeddings

**Estimated complexity:** Medium. The embedding call itself is already abstracted in `server/ai/embeddings/embeddingService.js`. This is mostly scaffolding, not novel logic — roughly 200-250 lines of new service code.

***

## Concrete Recommendation 2: Unified KB Query API

**What to build:** `POST /api/kb/query` in a new `server/routes/kb.js` router.

**Request shape:**
```json
{ "query": "what did I save about RAG architecture?", "sources": ["bookmarks","notes","vault"], "limit": 10 }
```

**Response shape:**
```json
{
  "answer": "...",
  "sources": [
    { "type": "bookmark", "id": "...", "title": "...", "url": "...", "score": 0.91 },
    { "type": "note", "id": "...", "title": "...", "score": 0.87 }
  ]
}
```

**Internal flow:**
1. Embed the `query` using the existing `generateEmbedding()` function
2. Run cosine similarity against `content_embeddings` filtered by `source_type` IN (`sources` param) — identical to the pattern in `semanticSearchBookmarks()`
3. Retrieve top-k chunks (k=10 default), deduplicate by source document
4. If cloud synthesis is requested and the user is under their `aiCostCap.js` limit, stuff retrieved chunks into a Gemini prompt and return a grounded answer
5. If local path is preferred or the user is on free tier, return ranked sources only — the frontend renders them as cards

**Cost gating:** The retrieval step (embedding + cosine similarity) is entirely local and free. Only the final synthesis LLM call consumes cloud quota. This means free users get semantic search with source cards; Pro users get the synthesized answer paragraph. This is a clean Pro upsell without degrading the free experience.

**Estimated complexity:** Low-Medium. The retrieval logic directly mirrors `semanticSearchBookmarks()`. The synthesis prompt is ~20 lines. The route handler is ~80 lines total.

***

## Concrete Recommendation 3: The MCP Server (`server/mcp/`)

**What to build:** A dedicated `server/mcp/` directory containing a standards-compliant MCP server that wraps the KB query API.

MCP uses JSON-RPC 2.0 over stdio or SSE/HTTP. The HTTP transport is the right choice here since Glassy already runs an Express server on port 3000 — the MCP server is just a new Express sub-router mounted at `/mcp`.[^15]

**Minimal tool surface (5 tools to start):**

| Tool Name | Description | Calls |
|---|---|---|
| `glassy_search` | Semantic search over full corpus | `POST /api/kb/query` |
| `glassy_add_capture` | Save a URL/snippet from an AI tool back into Glassy | `POST /api/captures` |
| `glassy_get_recent` | Retrieve N most recently captured items | `GET /api/captures?limit=N` |
| `glassy_obsidian_query` | Query specifically against the Obsidian vault | `POST /api/kb/query` with `sources: ["vault"]` |
| `glassy_note_create` | Create a new note from an AI tool | `POST /api/notes` |

This is the exact surface that makes Glassy competitive with tools like Recall and the MCP bookmark manager built as a Hacker News project — but self-hosted, with full Obsidian integration, and with local embeddings as the free tier.[^16][^10]

**Authentication:** MCP tool calls from Claude Desktop or Cursor need to authenticate. The simplest approach is a per-user MCP API key generated from the existing `server/services/apiKeyService.js` infrastructure. The user copies the config snippet into their Claude Desktop `claude_desktop_config.json` — identical to how every other MCP server does it.[^17]

**MCP config snippet users will paste:**
```json
{
  "mcpServers": {
    "glassy": {
      "command": "npx",
      "args": ["-y", "@glassy/mcp-server"],
      "env": {
        "GLASSY_URL": "http://localhost:3000",
        "GLASSY_API_KEY": "<your-key>"
      }
    }
  }
}
```

Or for the HTTP SSE transport (preferable since Glassy is already running):
```json
{
  "mcpServers": {
    "glassy": {
      "url": "http://localhost:3000/mcp/sse",
      "headers": { "Authorization": "Bearer <your-key>" }
    }
  }
}
```

**Estimated complexity:** Low, given the KB query API is built first. The MCP protocol layer for HTTP/SSE is well-documented and the `@modelcontextprotocol/sdk` npm package handles the JSON-RPC plumbing. The Glassy MCP server is essentially a thin adapter over endpoints that already exist or will exist after Recommendations 1 and 2.

***

## Concrete Recommendation 4: Hybrid Search Upgrade for Obsidian Vault

**What to build:** Replace pure cosine-similarity vault search with hybrid BM25 + vector search, matching the state of the art.

The best open-source Obsidian MCP server published in May 2026 uses BM25 + trigram fuzzy matching + vector embeddings fused with Reciprocal Rank Fusion, all in SQLite. Pure vector search fails on exact proper nouns, code snippets, and specific dates — cases where keyword search dominates. Hybrid search with RRF reliably outperforms either alone.[^5][^14]

SQLite already has FTS5 (full-text search) built in. The implementation is:
1. Create an FTS5 virtual table over vault file content
2. Run BM25 query alongside the existing cosine similarity query
3. Merge results with RRF (`1 / (k + rank_in_list)` for each result in each ranking, sum scores)

This is a vault-specific enhancement that can be implemented without touching the bookmark or notes embedding paths. Given that the `obsidian.js` route file is 59KB and the vault integration is already a first-class pillar, this is the correct place to invest in search quality.

**Estimated complexity:** Medium. FTS5 is available in SQLite without extensions. The RRF merge is ~30 lines of JavaScript. The main cost is the migration to add the FTS5 virtual table and populate it from vault files on sync.

***

## Concrete Recommendation 5: `#/kb` Workspace UI

**What to build:** A new React workspace at `#/kb` with a conversational query interface, source citation cards, and a corpus manager.

**Priority panels:**
- **Query panel** — single-line input, "Ask your knowledge base..." placeholder, streams the synthesized answer with inline source citations below
- **Source cards** — each retrieved chunk renders as a card with favicon (for bookmarks), note icon, or vault icon, showing title + excerpt + similarity score + direct link to the source item in Glassy
- **Corpus manager** — sidebar listing indexed source counts by type (X bookmarks embedded, Y notes embedded, Z vault files embedded) with a "Re-index" button and "Last indexed" timestamp
- **Scope toggle** — pill buttons to restrict search to All / Keep / Notes / Vault

The interaction model here is closer to Recall or NotebookLM than to a standard search box. The key UX differentiator is cited sources — every answer should link back to the item in Glassy Keep or Notes that produced it. This makes the knowledge base auditable and drives users back into their corpus to refine and annotate.[^18][^19]

**TanStack Query integration:** The query panel uses `useMutation` against `POST /api/kb/query`. The corpus manager uses a `useQuery` hook against `GET /api/kb/status` which returns per-source embedding counts. Consistent with existing patterns throughout the codebase.

***

## Concrete Recommendation 6: Companion Extension Bridge (In-Browser MCP)

**What to build:** A bridge from Glassy Companion to the MCP server that allows Claude.ai's web interface to call `glassy_search` directly from the browser.

Claude.ai supports MCP through its browser interface when a compatible extension is present. The Glassy Companion (v2.4.0, MV3 architecture with an offscreen document) is already running as a persistent background process — the offscreen document pattern makes it suitable for maintaining an SSE connection to the Express server.[^20][^6]

The implementation adds a new message type to the Companion's message broker: `MCP_TOOL_CALL`. When Claude.ai (or any tab) sends a well-formed MCP tool call to the extension via `chrome.runtime.sendMessage`, the offscreen document proxies it to `http://localhost:3000/mcp/sse` and returns the response. This gives Glassy a *two-surface MCP presence*:
- **Desktop AI tools** (Claude Desktop, Cursor, Windsurf) connect directly to the Express server
- **Browser-based AI tools** (Claude.ai, Perplexity, etc.) connect via the Companion extension

This is structurally similar to the browser-control-mcp pattern (MCP server + Firefox extension as paired components) but with the advantage that Glassy already has both halves.[^20]

**Estimated complexity:** Medium-High. The offscreen SSE proxy is new territory for the Companion, but the MV3 offscreen architecture added in v2.3.1 was designed for exactly this kind of persistent network connection. The Companion changelog shows this has already been proven viable for screenshot processing.

***

## Implementation Sequence and Priority

| Phase | Work Item | Files | Effort | Impact |
|---|---|---|---|---|
| **1** | Unified corpus indexer (notes + vault) | `server/services/corpusIndexer.js`, migration `~0070` | 3-4 days | Unlocks everything |
| **2** | `POST /api/kb/query` unified endpoint | `server/routes/kb.js` | 2 days | Core RAG surface |
| **3** | MCP server (HTTP/SSE, 5 tools) | `server/mcp/` | 2-3 days | Claude Desktop / Cursor integration |
| **4** | `#/kb` workspace UI | `src/pages/KnowledgeBase/` | 3-5 days | User-facing payoff |
| **5** | Hybrid BM25 + vector search for vault | Migration + FTS5 in `obsidian.js` | 2 days | Search quality |
| **6** | Companion MCP bridge | Companion offscreen + message types | 3-4 days | Browser AI integration |

Phases 1-4 constitute the minimum viable "Glassy as MCP knowledge server" release. Phases 5-6 are quality-and-reach upgrades that can ship in a follow-on version.

***

## Why This Works as a Product Narrative

The market timing is correct. Pocket shutting down in July 2025 and MarkDownload's removal from the Chrome Web Store created a genuine gap for a self-hosted web clipper with real AI integration. The best existing tools in the MCP knowledge space — Recall, memory-sqlite, the Obsidian hybrid search server — all require separate setup, separate databases, and separate extension installs. Glassy already ships all three components (app, extension, Obsidian integration) as a unified product.[^11]

The self-hosted, local-first positioning directly addresses the #1 concern voiced about cloud-based second-brain tools: data ownership. The screenpipe project (YC S26) is the most visible example of the "local AI memory" category gaining serious traction — Glassy Companion is doing the same thing but intentionally (user-initiated captures) rather than indiscriminately. That is a privacy advantage, not a limitation.[^21][^8][^9][^3]

The $7/month Pro tier pricing becomes far more defensible once MCP is shipping. The value proposition shifts from "nice notes app" to "your personal AI memory layer that works with every AI tool you already use." The MCP server is the unlock for that positioning — and according to the ecosystem evidence, it is currently one of the most-requested missing features in the personal knowledge management category.[^22][^2][^10]

---

## References

1. [The Model Context Protocol's impact on 2025](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/model-context-protocol-mcp-impact-2025) - The Model Context Protocol (MCP) has been one of the key stories of 2025. We unpack its impact throu...

2. [Top 10 MCP Servers Transforming AI Agent Development in ...](https://www.xpay.sh/blog/article/top-mcp-servers/) - The Obsidian MCP server exposes your personal vault to AI agents, enabling them to search your notes...

3. [Local memory for AI assistants, single SQLite file, no cloud](https://www.reddit.com/r/mcp/comments/1snnqzp/local_memory_for_ai_assistants_single_sqlite_file/) - It is an MCP server that stores everything in a single SQLite file on your machine. 13 tools for thi...

4. [The best way to build a RAG in 2026? Expose it as an MCP ...](https://www.reddit.com/r/mcp/comments/1rzkne0/the_best_way_to_build_a_rag_in_2026_expose_it_as/) - I wanted to kick off a discussion about how to build better RAG pipelines, specifically around the r...

5. [I built an MCP server that gives AI assistants proper hybrid ...](https://www.reddit.com/r/Rag/comments/1tsl62f/i_built_an_mcp_server_that_gives_ai_assistants/) - I built an MCP server that gives AI assistants proper hybrid search over your Obsidian vault (BM25 +...

6. [hangwin/mcp-chrome: Chrome MCP Server is ...](https://github.com/hangwin/mcp-chrome) - Chrome MCP Server is a Chrome extension-based Model Context Protocol (MCP) server that exposes your ...

7. [Open-source Chrome MCP Server enabling AI to control, ...](https://www.reddit.com/r/MCPservers/comments/1m0szdn/opensource_chrome_mcp_server_enabling_ai_to/) - So there is an open source MCP which make your browser AI enabled. Best part is it can work with any...

8. [screenpipe/screenpipe: YC (S26) | AI that knows what you' ...](https://github.com/screenpipe/screenpipe) - screenpipe is an open source application (MIT license) that continuously captures your screen and au...

9. [About screenpipe | Open source AI screen memory](https://screenpi.pe/about) - 100% local by default: All screen captures, audio, extracted text, and transcriptions are stored on ...

10. [Best MCP servers for productivity and personal knowledge ...](https://www.reddit.com/r/mcp/comments/1tctvfv/best_mcp_servers_for_productivity_and_personal/) - 1. Recall MCP. Best for: bringing your trusted sources into any AI conversation. Recall is a persona...

11. [Best Web Clipper in 2026 — After MarkDownload's Removal ...](https://web2md.org/blog/web-clipper-comparison-2026-after-markdownload-pocket) - MarkDownload was removed from the Chrome Web Store in 2025. Pocket shut down in July 2025. Two of th...

12. [MCP vs RAG Compared for Production Teams](https://portkey.ai/blog/mcp-vs-rag) - Building a hybrid RAG and MCP architecture. In production, the most reliable AI systems combine RAG ...

13. [RAG vs MCP: The Complete Guide to Context-Aware ...](https://explainx.ai/blog/rag-vs-mcp-complete-comparison-2026) - Hybrid Architecture: RAG + MCP Together. The most powerful production systems use both RAG and MCP. ...

14. [RAG MCP and Agentic AI: Architecture Patterns for 2026](https://aetherlink.ai/en/blog/rag-mcp-and-agentic-ai-architecture-patterns-for-2026) - Learn critical RAG, MCP, and agentic AI architecture patterns every AI Lead Architect must master in...

15. [10 Best MCP Servers for Developers in 2026](https://www.firecrawl.dev/blog/best-mcp-servers-for-developers) - The best MCP servers for developers in 2026 — covering web scraping, design, browser automation, cod...

16. [I built an MCP-connected bookmark manager because X's ...](https://news.ycombinator.com/item?id=47384765) - So I built a web app + extension that adds a save button to every tweet. One click captures everythi...

17. [shaneholloman/mcp-knowledge-graph ...](https://github.com/shaneholloman/mcp-knowledge-graph) - Persistent memory for AI models through a local knowledge graph. Store and retrieve information acro...

18. [Build an AI Second Brain with RAG: Complete Guide (2026)](https://buildtolaunch.substack.com/p/ai-second-brain-rag-guide) - Build an AI-powered second brain using RAG (Retrieval Augmented Generation). Index 30+ articles for ...

19. [What Is the AI Second Brain? How to Build a Knowledge ...](https://www.mindstudio.ai/blog/what-is-ai-second-brain/) - This guide breaks down what an AI second brain actually is, how the underlying architecture works, w...

20. [browser-control-mcp - MCP Server Registry](https://www.augmentcode.com/mcp/browser-control-mcp) - MCP server (Node/TypeScript) plus Firefox extension that lets AI agents manage browser tabs, history...

21. [What's In Your Second Brain? - by Robert Matsuoka - Hyperdev](https://hyperdev.matsuoka.com/p/whats-in-your-second-brain) - MCP as infrastructure. The Model Context Protocol creates a standard interface for exactly this kind...

22. [Top Knowledge & Memory MCP Servers - Awesome Claude](https://awesomeclaude.ai/mcp/knowledge-memory) - Discover the best Knowledge & Memory MCP servers for Claude and AI assistants. Browse 33 servers ran...

