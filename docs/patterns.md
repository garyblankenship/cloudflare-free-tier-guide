# Architecture Patterns

## Edge-First Architecture
**Found**: 2025-07-18
**Location**: All guides, especially `page1-hono.md`
**Details**: Everything runs at the edge by default with global deployment

### Pattern Structure
```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Pages     │────▶│   Workers    │────▶│     D1     │
│  (React)    │     │   (API)      │     │ (Database) │
└─────────────┘     └──────────────┘     └────────────┘
                            │
                            ├──────────────▶ KV (Sessions)
                            ├──────────────▶ R2 (Images)
                            ├──────────────▶ Vectorize (Search)
                            └──────────────▶ Workers AI (LLMs)
```

## Zero-Cost Infrastructure Stack
**Found**: 2025-07-18
**Location**: `guide1.md`
**Details**: Complete production stack on free tier

### Service Combination
- **Static Hosting**: Cloudflare Pages (unlimited bandwidth)
- **API Layer**: Workers (100K requests/day)
- **Databases**: D1 (5GB), KV (1GB), Vectorize (5M vectors)
- **Storage**: R2 (10GB with zero egress)
- **AI**: Workers AI (10K neurons/day)

## Hono Framework Pattern
**Found**: 2025-07-18
**Location**: `page1-hono.md`
**Details**: Clean API routing with TypeScript

### Implementation
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'

const app = new Hono<{ Bindings: Env }>()
  .use('*', cors())
  .use('/api/*', jwt({ secret: c.env.JWT_SECRET }))
  .route('/api/posts', postsRouter)
  .route('/api/users', usersRouter)
```

## Multi-Service Integration
**Found**: 2025-07-18
**Location**: Throughout guides
**Details**: Combining all free services for complete applications

### Service Roles
- **D1**: Primary relational data
- **KV**: Session management, caching
- **R2**: File/image storage
- **Vectorize**: Semantic search
- **Workers AI**: Text/image generation

## Intelligent Caching Pattern
**Found**: 2025-07-18
**Location**: Multiple guides
**Details**: Critical for staying within free limits

### Cache Hierarchy
1. **Edge Cache**: Browser caching headers
2. **Cache API**: Worker-level caching
3. **KV Cache**: Persistent response caching
4. **Semantic Cache**: AI response deduplication

## Vector Search Architecture
**Found**: 2025-07-18
**Location**: `page2-vectorize.md`
**Details**: Semantic search with embeddings

### Implementation Pattern
```typescript
// 1. Generate embeddings
const embedding = await ai.run('@cf/baai/bge-base-en-v1.5', {
  text: searchQuery
})

// 2. Vector search
const results = await env.VECTORIZE.query(embedding.data[0], {
  topK: 10,
  filter: { published: true }
})

// 3. Hybrid with keyword search
const combined = mergeResults(vectorResults, keywordResults)
```

## RAG System Pattern
**Found**: 2025-07-18
**Location**: `page4-autorag.md`
**Details**: Retrieval-augmented generation architecture

### RAG Pipeline
1. **Ingestion**: Process documents → Generate embeddings → Store in Vectorize
2. **Retrieval**: User query → Embedding → Vector search → Get context
3. **Generation**: Context + Query → LLM → Streaming response
4. **Caching**: Semantic similarity for response deduplication

## Security Patterns
**Found**: 2025-07-18
**Location**: Throughout guides
**Details**: Production-ready security implementations

### Key Patterns
- **JWT Authentication**: Stateless auth with Workers
- **Rate Limiting**: Using Durable Objects for global state
- **WAF Rules**: SQL injection and XSS protection
- **CSP Headers**: Content security policies

## Performance Optimization
**Found**: 2025-07-18
**Location**: All guides
**Details**: Edge performance best practices

### Optimization Strategies
- **No Cold Starts**: V8 isolates always warm
- **Streaming Responses**: Real-time data delivery
- **Batch Operations**: Minimize API calls
- **Global Distribution**: 300+ edge locations