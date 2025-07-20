# KV Store: Lightning-Fast Key-Value Storage

## The 5-Minute Proof

> **The Pitch:** KV is a globally distributed key-value store that gives you 100K daily reads with 5-10ms latency worldwide - perfect for sessions, caching, and config.
>
> **The Win:** 
> ```typescript
> // Store and retrieve globally in milliseconds
> await env.KV.put('session:abc123', JSON.stringify(userData), {
>   expirationTtl: 3600 // Auto-expires in 1 hour
> })
> const session = await env.KV.get('session:abc123', 'json')
> ```
>
> **The Catch:** 1,000 writes/day limit on free tier - use it for read-heavy data like sessions and caching, not for primary data storage.

---

> **TL;DR - Key Takeaways**
> - **What**: Globally distributed key-value store with edge caching
> - **Free Tier**: 100,000 reads/day, 1,000 writes/day, 1GB storage
> - **Primary Use Cases**: Session storage, feature flags, caching, user preferences
> - **Key Features**: Global replication, 60s consistency, unlimited key size
> - **Limitations**: Eventually consistent, 1,000 writes/day, 25MB value size limit

## Global State Management at the Edge

Workers KV provides a globally distributed key-value store with eventual consistency, perfect for caching, session management, and configuration storage. With 100,000 reads and 1,000 writes daily on the free tier, plus 1GB of storage, it's an essential component of edge applications.

### Understanding KV's Architecture

KV is designed for read-heavy workloads with global distribution:

```javascript
// KV vs Traditional Solutions
const comparison = {
  redis: {
    latency: "1-5ms in region, 100ms+ elsewhere",
    consistency: "Strong",
    deployment: "Single region or complex clustering",
    cost: "$15+/month minimum"
  },
  dynamodb: {
    latency: "10-20ms in region",
    consistency: "Configurable",
    deployment: "Regional with global tables ($$$)",
    cost: "$0.25/million reads"
  },
  workersKV: {
    latency: "5-10ms globally",
    consistency: "Eventual (60s globally)",
    deployment: "Automatic global replication",
    cost: "100K reads/day free"
  }
}
```

### Getting Started with KV

Create a namespace:

```bash
# Create KV namespace
wrangler kv:namespace create "CACHE"
wrangler kv:namespace create "SESSIONS"
wrangler kv:namespace create "CONFIG"
```

Basic operations:

```typescript
interface Env {
  CACHE: KVNamespace
  SESSIONS: KVNamespace
  CONFIG: KVNamespace
}

export default {
  async fetch(request: Request, env: Env) {
    // Write data
    await env.CACHE.put('user:123', JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com'
    }), {
      expirationTtl: 3600 // 1 hour
    })
    
    // Read data
    const user = await env.CACHE.get('user:123', 'json')
    
    // Delete data
    await env.CACHE.delete('user:123')
    
    // List keys
    const list = await env.CACHE.list({ prefix: 'user:' })
    
    return Response.json({ user, keys: list.keys })
  }
}
```

### Real-World Patterns

#### Session Management
```typescript
interface Session {
  userId: string
  createdAt: number
  data: Record<string, any>
}

export class SessionManager {
  constructor(private kv: KVNamespace) {}
  
  async create(userId: string): Promise<string> {
    const sessionId = crypto.randomUUID()
    const session: Session = {
      userId,
      createdAt: Date.now(),
      data: {}
    }
    
    await this.kv.put(
      `session:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: 86400 } // 24 hours
    )
    
    return sessionId
  }
  
  async get(sessionId: string): Promise<Session | null> {
    return await this.kv.get(`session:${sessionId}`, 'json')
  }
  
  async update(sessionId: string, data: Record<string, any>) {
    const session = await this.get(sessionId)
    if (!session) throw new Error('Session not found')
    
    session.data = { ...session.data, ...data }
    
    await this.kv.put(
      `session:${sessionId}`,
      JSON.stringify(session),
      { expirationTtl: 86400 }
    )
  }
  
  async destroy(sessionId: string) {
    await this.kv.delete(`session:${sessionId}`)
  }
}

// Usage in Worker
export default {
  async fetch(request: Request, env: Env) {
    const sessions = new SessionManager(env.SESSIONS)
    
    // Create session on login
    if (request.url.includes('/login')) {
      const sessionId = await sessions.create('user123')
      
      return new Response('Logged in', {
        headers: {
          'Set-Cookie': `session=${sessionId}; HttpOnly; Secure; SameSite=Strict`
        }
      })
    }
    
    // Check session
    const cookie = request.headers.get('Cookie')
    const sessionId = cookie?.match(/session=([^;]+)/)?.[1]
    
    if (sessionId) {
      const session = await sessions.get(sessionId)
      if (session) {
        // User is authenticated
        return Response.json({ user: session.userId })
      }
    }
    
    return new Response('Not authenticated', { status: 401 })
  }
}
```

#### Intelligent Caching
```typescript
export class CacheManager {
  constructor(
    private kv: KVNamespace,
    private options: {
      ttl?: number
      staleWhileRevalidate?: number
    } = {}
  ) {}
  
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try cache first
    const cached = await this.kv.get(key, 'json') as {
      data: T
      expires: number
      stale: number
    } | null
    
    const now = Date.now()
    
    // Return fresh cache
    if (cached && cached.expires > now) {
      return cached.data
    }
    
    // Return stale while revalidating
    if (cached && cached.stale > now) {
      // Revalidate in background
      this.revalidate(key, fetcher, ttl)
      return cached.data
    }
    
    // Cache miss - fetch fresh data
    const data = await fetcher()
    await this.set(key, data, ttl)
    
    return data
  }
  
  private async set<T>(key: string, data: T, ttl?: number) {
    const cacheTtl = ttl || this.options.ttl || 3600
    const staleTtl = this.options.staleWhileRevalidate || 86400
    
    await this.kv.put(key, JSON.stringify({
      data,
      expires: Date.now() + (cacheTtl * 1000),
      stale: Date.now() + (staleTtl * 1000)
    }), {
      expirationTtl: staleTtl
    })
  }
  
  private async revalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ) {
    try {
      const data = await fetcher()
      await this.set(key, data, ttl)
    } catch (error) {
      console.error('Revalidation failed:', error)
    }
  }
}

// Usage
export default {
  async fetch(request: Request, env: Env) {
    const cache = new CacheManager(env.CACHE, {
      ttl: 300, // 5 minutes
      staleWhileRevalidate: 3600 // 1 hour
    })
    
    // Expensive API call cached
    const data = await cache.get(
      'api:users',
      async () => {
        const response = await fetch('https://api.example.com/users')
        return response.json()
      }
    )
    
    return Response.json(data)
  }
}
```

#### Feature Flags
```typescript
interface FeatureFlag {
  enabled: boolean
  rolloutPercentage?: number
  allowedUsers?: string[]
  metadata?: Record<string, any>
}

export class FeatureFlagManager {
  constructor(private kv: KVNamespace) {}
  
  async isEnabled(
    flagName: string,
    userId?: string
  ): Promise<boolean> {
    const flag = await this.kv.get<FeatureFlag>(
      `flag:${flagName}`,
      'json'
    )
    
    if (!flag) return false
    if (!flag.enabled) return false
    
    // Check allowed users
    if (flag.allowedUsers?.includes(userId || '')) {
      return true
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage) {
      const hash = await this.hash(flagName + userId)
      const threshold = flag.rolloutPercentage / 100
      return hash < threshold
    }
    
    return flag.enabled
  }
  
  private async hash(input: string): Promise<number> {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    
    // Convert to number between 0 and 1
    return hashArray[0] / 255
  }
  
  async setFlag(flagName: string, flag: FeatureFlag) {
    await this.kv.put(
      `flag:${flagName}`,
      JSON.stringify(flag)
    )
  }
}

// Usage
export default {
  async fetch(request: Request, env: Env) {
    const flags = new FeatureFlagManager(env.CONFIG)
    const userId = request.headers.get('X-User-ID')
    
    const features = {
      newUI: await flags.isEnabled('new-ui', userId),
      betaFeature: await flags.isEnabled('beta-feature', userId),
      experiments: await flags.isEnabled('experiments', userId)
    }
    
    return Response.json({ features })
  }
}
```

#### Rate Limiting
```typescript
export class RateLimiter {
  constructor(
    private kv: KVNamespace,
    private config: {
      windowMs: number
      maxRequests: number
    }
  ) {}
  
  async check(identifier: string): Promise<{
    allowed: boolean
    remaining: number
    resetAt: number
  }> {
    const key = `rate:${identifier}`
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    
    // Get current window data
    const data = await this.kv.get<{
      requests: Array<number>
    }>(key, 'json') || { requests: [] }
    
    // Filter out old requests
    data.requests = data.requests.filter(time => time > windowStart)
    
    const allowed = data.requests.length < this.config.maxRequests
    
    if (allowed) {
      data.requests.push(now)
      
      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: Math.ceil(this.config.windowMs / 1000)
      })
    }
    
    return {
      allowed,
      remaining: Math.max(0, this.config.maxRequests - data.requests.length),
      resetAt: windowStart + this.config.windowMs
    }
  }
}

// Usage
export default {
  async fetch(request: Request, env: Env) {
    const limiter = new RateLimiter(env.CACHE, {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    })
    
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const { allowed, remaining, resetAt } = await limiter.check(ip)
    
    if (!allowed) {
      return new Response('Rate limit exceeded', {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(resetAt).toISOString()
        }
      })
    }
    
    // Process request
    return new Response('OK', {
      headers: {
        'X-RateLimit-Remaining': remaining.toString()
      }
    })
  }
}
```

#### Configuration Management
```typescript
interface Config {
  apiKeys: Record<string, string>
  features: Record<string, boolean>
  limits: Record<string, number>
  urls: Record<string, string>
}

export class ConfigManager {
  private cache: Config | null = null
  private lastFetch = 0
  private ttl = 60000 // 1 minute
  
  constructor(private kv: KVNamespace) {}
  
  async get(): Promise<Config> {
    const now = Date.now()
    
    // Return cached if fresh
    if (this.cache && (now - this.lastFetch) < this.ttl) {
      return this.cache
    }
    
    // Fetch from KV
    const config = await this.kv.get<Config>('config:global', 'json')
    
    if (!config) {
      throw new Error('Configuration not found')
    }
    
    this.cache = config
    this.lastFetch = now
    
    return config
  }
  
  async update(updates: Partial<Config>) {
    const current = await this.get()
    const updated = { ...current, ...updates }
    
    await this.kv.put('config:global', JSON.stringify(updated))
    
    // Invalidate cache
    this.cache = null
  }
}

// Usage
export default {
  async fetch(request: Request, env: Env) {
    const config = new ConfigManager(env.CONFIG)
    
    // Get configuration
    const { apiKeys, features, limits } = await config.get()
    
    // Check API key
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey || !Object.values(apiKeys).includes(apiKey)) {
      return new Response('Invalid API key', { status: 401 })
    }
    
    // Check feature flag
    if (!features.betaApi) {
      return new Response('Beta API is disabled', { status: 503 })
    }
    
    return Response.json({ 
      message: 'Welcome to the API',
      rateLimit: limits.apiCalls 
    })
  }
}
```

### Advanced KV Patterns

#### Distributed Locks
```typescript
export class DistributedLock {
  constructor(private kv: KVNamespace) {}
  
  async acquire(
    resource: string,
    ttl: number = 30
  ): Promise<string | null> {
    const lockId = crypto.randomUUID()
    const key = `lock:${resource}`
    
    // Try to acquire lock
    const success = await this.kv.put(key, lockId, {
      expirationTtl: ttl,
      // Only set if key doesn't exist
      expiration: Date.now() + (ttl * 1000)
    })
    
    // Verify we got the lock
    const current = await this.kv.get(key)
    
    return current === lockId ? lockId : null
  }
  
  async release(resource: string, lockId: string) {
    const key = `lock:${resource}`
    const current = await this.kv.get(key)
    
    // Only release if we own the lock
    if (current === lockId) {
      await this.kv.delete(key)
    }
  }
  
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockId = await this.acquire(resource)
    
    if (!lockId) {
      throw new Error('Failed to acquire lock')
    }
    
    try {
      return await fn()
    } finally {
      await this.release(resource, lockId)
    }
  }
}
```

#### Event Sourcing with KV
```typescript
interface Event {
  id: string
  type: string
  aggregateId: string
  data: any
  timestamp: number
}

export class EventStore {
  constructor(private kv: KVNamespace) {}
  
  async append(event: Event) {
    const key = `events:${event.aggregateId}:${event.timestamp}:${event.id}`
    
    await this.kv.put(key, JSON.stringify(event), {
      metadata: {
        type: event.type,
        aggregateId: event.aggregateId
      }
    })
  }
  
  async getEvents(
    aggregateId: string,
    fromTimestamp?: number
  ): Promise<Event[]> {
    const prefix = `events:${aggregateId}:`
    const start = fromTimestamp 
      ? `${prefix}${fromTimestamp}`
      : prefix
    
    const list = await this.kv.list({
      prefix,
      start
    })
    
    const events = await Promise.all(
      list.keys.map(async (key) => {
        const event = await this.kv.get(key.name, 'json')
        return event as Event
      })
    )
    
    return events.filter(Boolean)
  }
  
  async getLatestSnapshot(aggregateId: string) {
    return await this.kv.get(
      `snapshot:${aggregateId}`,
      'json'
    )
  }
  
  async saveSnapshot(aggregateId: string, state: any) {
    await this.kv.put(
      `snapshot:${aggregateId}`,
      JSON.stringify({
        state,
        timestamp: Date.now()
      })
    )
  }
}
```

### Performance Optimization

#### Batch Operations
```typescript
export async function batchGet(
  kv: KVNamespace,
  keys: string[]
): Promise<Map<string, any>> {
  const results = new Map()
  
  // KV doesn't have native batch, so parallelize
  const promises = keys.map(async (key) => {
    const value = await kv.get(key, 'json')
    if (value !== null) {
      results.set(key, value)
    }
  })
  
  await Promise.all(promises)
  
  return results
}

// Usage with caching
export class BatchCache {
  private pending = new Map<string, Promise<any>>()
  
  constructor(private kv: KVNamespace) {}
  
  async get(key: string): Promise<any> {
    // Check if already fetching
    if (this.pending.has(key)) {
      return this.pending.get(key)
    }
    
    // Create promise
    const promise = this.kv.get(key, 'json')
    this.pending.set(key, promise)
    
    // Clean up after resolution
    promise.finally(() => this.pending.delete(key))
    
    return promise
  }
}
```

#### Cache Warming
```typescript
export class CacheWarmer {
  constructor(
    private kv: KVNamespace,
    private db: D1Database
  ) {}
  
  async warmCache(keys: string[]) {
    const missingKeys: string[] = []
    
    // Check what's missing
    for (const key of keys) {
      const exists = await this.kv.get(key)
      if (!exists) {
        missingKeys.push(key)
      }
    }
    
    // Batch fetch from database
    if (missingKeys.length > 0) {
      const data = await this.fetchFromDatabase(missingKeys)
      
      // Store in KV
      await Promise.all(
        data.map(item => 
          this.kv.put(
            item.key,
            JSON.stringify(item.value),
            { expirationTtl: 3600 }
          )
        )
      )
    }
  }
  
  private async fetchFromDatabase(keys: string[]) {
    // Implementation depends on your schema
    return []
  }
}
```

### KV Limits and Best Practices

```typescript
const kvLimits = {
  keySize: "512 bytes",
  valueSize: "25 MB",
  metadataSize: "1024 bytes",
  listLimit: "1000 keys per operation",
  ttlMax: "365 days",
  consistency: "Eventual (60 seconds globally)"
}

const bestPractices = {
  keys: "Use prefixes for organization (user:123, session:abc)",
  values: "JSON for structured data, text for simple values",
  ttl: "Always set expiration for temporary data",
  consistency: "Don't rely on immediate global consistency",
  costs: "Optimize reads over writes (100:1 ratio in free tier)"
}
```

### KV vs Other Storage Options

```javascript
// When to use each Cloudflare storage option
const storageGuide = {
  kv: {
    useFor: ["Sessions", "Cache", "Config", "Feature flags"],
    strengths: "Global distribution, fast reads",
    weaknesses: "Eventual consistency, limited queries"
  },
  d1: {
    useFor: ["Relational data", "Transactions", "Complex queries"],
    strengths: "SQL, ACID, strong consistency",
    weaknesses: "Regional writes, query limits"
  },
  r2: {
    useFor: ["Files", "Images", "Backups", "Large data"],
    strengths: "S3 compatible, no egress fees",
    weaknesses: "Not for small, frequent updates"
  },
  durableObjects: {
    useFor: ["Real-time", "Coordination", "Stateful logic"],
    strengths: "Strong consistency, WebSockets",
    weaknesses: "Single location, higher cost"
  }
}
```

### Summary

Workers KV provides the perfect solution for global state management at the edge. With its generous free tier (100,000 reads daily), global distribution, and simple API, it excels at caching, session management, and configuration storage. While eventual consistency means it's not suitable for every use case, KV's performance characteristics make it ideal for read-heavy workloads that benefit from global distribution.

---

*Next: R2 Storage - Object storage with zero egress fees*