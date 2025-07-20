# Workers: Serverless Computing at the Edge

## The 5-Minute Proof

> **The Pitch:** Workers runs your JavaScript/TypeScript code in 300+ locations worldwide with zero cold starts. Unlike AWS Lambda's regional deployments, your API responds in milliseconds from everywhere.
>
> **The Win:** Create and deploy a global API in 2 minutes:
> ```javascript
> // worker.js - A complete API that runs globally
> export default {
>   async fetch(request, env) {
>     const url = new URL(request.url);
>     
>     if (url.pathname === "/api/hello") {
>       return Response.json({ 
>         message: "Hello from the edge!",
>         location: request.cf?.city || "Unknown",
>         latency: "< 50ms worldwide"
>       });
>     }
>     
>     return new Response("Not found", { status: 404 });
>   }
> };
> 
> // Deploy: npx wrangler deploy worker.js
> // 👆 Your API is now live globally with 100K free requests/day
> ```
>
> **The Catch:** The 10ms CPU limit means Workers are best for I/O operations, not heavy computation. Think API routing, not video encoding.

---

> **TL;DR - Key Takeaways**
> - **What**: Serverless functions running in 300+ global locations
> - **Free Tier**: 100,000 requests/day, 10ms CPU/request
> - **Primary Use Cases**: APIs, dynamic routing, authentication, real-time features
> - **Key Features**: Zero cold starts, global deployment, KV/D1/R2 bindings
> - **Limitations**: 10ms CPU burst (50ms sustained), 128MB memory, no persistent connections

## The Power of Distributed Compute

Workers fundamentally changes how we think about backend infrastructure. Instead of managing servers in specific regions, your code runs within 50ms of every user on Earth. With 100,000 free requests daily and no cold starts, it's serverless computing as it should be.

### Why Workers is Revolutionary

Traditional serverless platforms suffer from fundamental flaws:

```javascript
// Serverless platform comparison
const serverlessComparison = {
  awsLambda: {
    coldStart: "500ms-3s first request",
    region: "Pick one, far users suffer",
    complexity: "VPCs, security groups, IAM",
    cost: "$0.20/million requests + compute"
  },
  
  cloudflareWorkers: {
    coldStart: "0ms - always warm",
    region: "All 300+ locations simultaneously",
    complexity: "Just deploy your code",
    cost: "100K requests/day free"
  }
}
```

### Your First Worker

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    
    if (url.pathname === '/api/hello') {
      return new Response(JSON.stringify({
        message: 'Hello from the edge!',
        location: request.cf?.city,
        timestamp: Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response('Not Found', { status: 404 })
  }
}
```

Deploy instantly:
```bash
wrangler deploy
# ⛅️ Deployed to https://my-worker.username.workers.dev
```

### Workers Architecture

Workers run in V8 isolates, not containers:

```
Traditional Serverless:
Request → Load Balancer → Cold Container Startup (500ms+) → Your Code

Workers:
Request → Nearest Edge → Existing V8 Isolate (0ms) → Your Code
```

This architecture enables:
- **Zero cold starts**: Isolates are always ready
- **Minimal overhead**: ~5ms baseline latency
- **Global deployment**: Same code runs everywhere
- **Automatic scaling**: Handles traffic spikes instantly

### Connecting Services

Workers becomes powerful when integrated with other services:

```typescript
interface Env {
  DB: D1Database              // SQL database
  KV: KVNamespace            // Key-value store
  BUCKET: R2Bucket           // Object storage
  QUEUE: Queue               // Message queue
  AI: Ai                     // AI models
  VECTORIZE: VectorizeIndex  // Vector search
}

export default {
  async fetch(request: Request, env: Env) {
    // Query database
    const users = await env.DB
      .prepare('SELECT * FROM users WHERE active = ?')
      .bind(true)
      .all()
    
    // Cache in KV
    await env.KV.put('active_users', JSON.stringify(users), {
      expirationTtl: 3600
    })
    
    // Store files in R2
    const file = await request.blob()
    await env.BUCKET.put(`uploads/${Date.now()}`, file)
    
    // Queue background job
    await env.QUEUE.send({ 
      type: 'process_upload',
      timestamp: Date.now() 
    })
    
    return Response.json({ success: true })
  }
}
```

### Real-World Patterns

#### RESTful API
```typescript
import { Router } from 'itty-router'

const router = Router()

// User endpoints
router.get('/api/users', async (request, env) => {
  const users = await env.DB.prepare('SELECT * FROM users').all()
  return Response.json(users.results)
})

router.post('/api/users', async (request, env) => {
  const user = await request.json()
  const result = await env.DB
    .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .bind(user.name, user.email)
    .run()
  
  return Response.json({ id: result.meta.last_row_id })
})

router.get('/api/users/:id', async (request, env) => {
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(request.params.id)
    .first()
    
  return user 
    ? Response.json(user)
    : new Response('Not Found', { status: 404 })
})

// Handle all requests
export default {
  fetch: router.handle
}
```

#### Authentication Middleware
```typescript
async function authenticate(request: Request, env: Env) {
  const token = request.headers.get('Authorization')?.split(' ')[1]
  
  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  try {
    const payload = await jwt.verify(token, env.JWT_SECRET)
    request.user = payload
  } catch (error) {
    return new Response('Invalid token', { status: 401 })
  }
}

router.get('/api/protected/*', authenticate, async (request) => {
  // User is authenticated
  return Response.json({ 
    message: 'Secret data',
    user: request.user 
  })
})
```

#### Rate Limiting
```typescript
async function rateLimit(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP')
  const key = `rate_limit:${ip}`
  
  const current = await env.KV.get(key)
  const count = current ? parseInt(current) + 1 : 1
  
  if (count > 100) { // 100 requests per hour
    return new Response('Rate limit exceeded', { status: 429 })
  }
  
  await env.KV.put(key, count.toString(), { 
    expirationTtl: 3600 
  })
}

router.all('*', rateLimit)
```

### Advanced Workers Features

#### Cron Triggers
```typescript
// wrangler.toml
// [triggers]
// crons = ["0 * * * *"] # Every hour

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Clean up old sessions
    const yesterday = Date.now() - 86400000
    await env.DB
      .prepare('DELETE FROM sessions WHERE created_at < ?')
      .bind(yesterday)
      .run()
      
    // Generate reports
    const stats = await calculateDailyStats(env)
    await env.KV.put('daily_stats', JSON.stringify(stats))
  }
}
```

#### WebSocket Support
```typescript
export default {
  async fetch(request: Request, env: Env) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      
      handleWebSocket(server, env)
      
      return new Response(null, {
        status: 101,
        webSocket: client
      })
    }
    
    return new Response('Expected WebSocket', { status: 400 })
  }
}

async function handleWebSocket(ws: WebSocket, env: Env) {
  ws.accept()
  
  ws.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data)
    
    // Broadcast to all connected clients
    await env.CONNECTIONS.broadcast(data)
  })
}
```

#### Service Bindings
```typescript
// worker-a/wrangler.toml
// [[services]]
// binding = "AUTH_SERVICE"
// service = "auth-worker"

export default {
  async fetch(request: Request, env: Env) {
    // Call another Worker directly (no HTTP overhead)
    const authResult = await env.AUTH_SERVICE.fetch(
      new Request('http://internal/verify', {
        method: 'POST',
        body: JSON.stringify({ token: request.headers.get('Authorization') })
      })
    )
    
    if (!authResult.ok) {
      return new Response('Unauthorized', { status: 401 })
    }
    
    // Continue with authenticated request
    return handleRequest(request, env)
  }
}
```

### Performance Optimization

#### Request Coalescing
```typescript
const cache = new Map()

async function fetchWithCoalescing(key: string, fetcher: () => Promise<any>) {
  if (cache.has(key)) {
    return cache.get(key)
  }
  
  const promise = fetcher()
  cache.set(key, promise)
  
  try {
    const result = await promise
    setTimeout(() => cache.delete(key), 5000) // Cache for 5 seconds
    return result
  } catch (error) {
    cache.delete(key)
    throw error
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const data = await fetchWithCoalescing('users', async () => {
      return env.DB.prepare('SELECT * FROM users').all()
    })
    
    return Response.json(data)
  }
}
```

#### Response Streaming
```typescript
export default {
  async fetch(request: Request, env: Env) {
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    
    // Start streaming immediately
    const response = new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream' }
    })
    
    // Process in background
    const encoder = new TextEncoder()
    env.ctx.waitUntil(
      (async () => {
        for (let i = 0; i < 100; i++) {
          await writer.write(encoder.encode(`data: Event ${i}\n\n`))
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        writer.close()
      })()
    )
    
    return response
  }
}
```

### Workers Limits and Optimization

Understanding the free tier limits:

```typescript
const freeTierLimits = {
  requests: 100_000,          // Per day
  cpuTime: 10,               // Milliseconds per request
  memory: 128,               // MB per request
  subrequests: 50,           // External fetches per request
  envVars: 64,               // Environment variables
  scriptSize: 1,             // MB after compression
}

// Optimization strategies
const optimizations = {
  caching: "Use Cache API and KV for repeated data",
  batching: "Combine multiple operations",
  async: "Use waitUntil() for non-critical tasks",
  compression: "Compress large responses",
  earlyReturns: "Return responses as soon as possible"
}
```

### Integration Patterns

#### With Pages
```typescript
// pages/functions/api/[[path]].ts
export { default } from 'my-worker'
```

#### With D1 Database
```typescript
const schema = `
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_created ON articles(created_at);
`

export default {
  async fetch(request: Request, env: Env) {
    // Initialize database
    await env.DB.exec(schema)
    
    // Efficient queries
    const recent = await env.DB
      .prepare('SELECT * FROM articles ORDER BY created_at DESC LIMIT ?')
      .bind(10)
      .all()
      
    return Response.json(recent.results)
  }
}
```

#### With R2 Storage
```typescript
export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'PUT') {
      const key = new URL(request.url).pathname.slice(1)
      await env.BUCKET.put(key, request.body)
      
      return Response.json({ 
        uploaded: key,
        size: request.headers.get('Content-Length')
      })
    }
    
    // Generate presigned URL
    const url = await env.BUCKET.createSignedUrl(key, { 
      expiresIn: 3600 
    })
    
    return Response.json({ url })
  }
}
```

### Debugging and Monitoring

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const startTime = Date.now()
    
    try {
      const response = await handleRequest(request, env)
      
      // Log to Analytics Engine
      ctx.waitUntil(
        env.ANALYTICS.writeDataPoint({
          dataset: 'api_metrics',
          point: {
            route: new URL(request.url).pathname,
            method: request.method,
            status: response.status,
            duration: Date.now() - startTime,
            timestamp: Date.now()
          }
        })
      )
      
      return response
    } catch (error) {
      // Log errors
      console.error('Request failed:', error)
      
      return new Response('Internal Error', { status: 500 })
    }
  }
}
```

### Cost Comparison

Real-world cost analysis:

```javascript
// 3 million requests/month (100K/day)
const monthlyCosts = {
  awsLambda: {
    requests: 3_000_000 * 0.0000002,        // $0.60
    compute: 3_000_000 * 0.0000166667,      // $50.00
    total: 50.60                            // Plus API Gateway, etc.
  },
  vercelFunctions: {
    included: 1_000_000,                     // Free tier
    additional: 2_000_000 * 0.00001,         // $20.00
    total: 20.00
  },
  cloudflareWorkers: {
    total: 0                                 // 100K/day = 3M/month free
  }
}
```

### When to Use Workers

**Perfect for:**
- API backends
- Authentication services
- Image/video processing
- Real-time features
- Webhook handlers
- Edge middleware

**Consider alternatives when:**
- Need > 10ms CPU time (use Durable Objects)
- Require persistent connections (use Durable Objects)
- Need to run containers (use traditional cloud)

### Summary

Workers represents a paradigm shift in serverless computing. By running at the edge with zero cold starts and true global distribution, it enables applications that were previously impossible or prohibitively expensive. The generous free tier—100,000 requests daily—is enough for most applications to run indefinitely without cost. Workers excels at APIs, webhooks, real-time features, and any compute workload that benefits from global distribution.

---

*Next: D1 Database - SQLite at the edge*