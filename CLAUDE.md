# Project Assistant Context

## Quick Start
**Project**: Cloudflare Free Tier Guide Series
**Type**: Technical Documentation / Tutorial Series
**Language**: Markdown (with JavaScript/TypeScript examples)
**Run**: N/A - Documentation project
**Test**: N/A - Documentation project

## Key Locations
- Guide 1 - Overview: `/Users/vampire/www/cloudflare/guide1.md`
- Guide 2 - Hono Framework: `/Users/vampire/www/cloudflare/page1-hono.md`
- Guide 3 - Vector Search: `/Users/vampire/www/cloudflare/page2-vectorize.md`
- Guide 4 - Workers AI: `/Users/vampire/www/cloudflare/page3-workersai.md`
- Guide 5 - AutoRAG Systems: `/Users/vampire/www/cloudflare/page4-autorag.md`
[See full paths →](docs/paths.md)

## Recent Insights
<!-- Updated by /docs -->
- 2025-07-18: Discovered comprehensive free tier architecture patterns across 5 guides
- 2025-07-18: Found zero-cost infrastructure stack combining Pages, Workers, D1, KV, R2, Vectorize
- 2025-07-18: Identified edge-first architecture with global deployment capabilities
- 2025-07-18: Documented multi-service integration patterns for production apps

## Project Overview
This is a comprehensive guide series teaching developers how to build production-ready applications entirely on Cloudflare's free tier. The guides progress from basic static hosting to advanced AI-powered applications with vector search and RAG systems.

### Core Technologies Covered
- **Cloudflare Pages**: Static hosting with unlimited bandwidth
- **Workers**: Serverless functions (100K requests/day free)
- **D1**: SQLite database at the edge
- **KV**: Key-value storage for sessions/caching
- **R2**: Object storage with zero egress fees
- **Vectorize**: Vector database for semantic search
- **Workers AI**: LLMs and image generation

### Guide Progression
1. **Overview**: Complete free tier capabilities and limits
2. **Hono Framework**: Modern API development patterns
3. **Vector Search**: AI-powered semantic search implementation
4. **Workers AI**: Edge AI inference with multiple models
5. **AutoRAG**: Building retrieval-augmented generation systems

## Navigation
- [Paths](docs/paths.md) - Where everything lives
- [Patterns](docs/patterns.md) - Architecture patterns discovered
- [Solutions](docs/solutions.md) - Technical implementations
- [Decisions](docs/decisions.md) - Why specific approaches were chosen

## Key Takeaways
- Free tier supports 2-10K daily active users realistically
- Edge-first architecture eliminates cold starts
- Combine all services for complete production apps
- Intelligent caching crucial for staying within limits
- TypeScript provides full type safety across stack

## Development Process Notes
- Make edits to the individual sections. Build the complete.md file with the script.