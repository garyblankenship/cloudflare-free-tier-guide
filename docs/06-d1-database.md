# D1 Database: SQLite at the Edge

## The 5-Minute Proof

> **The Pitch:** D1 gives you a real SQLite database with 5GB storage and 5M daily reads for free, running globally at the edge with zero cold starts.
>
> **The Win:** 
> ```typescript
> // Query users instantly from anywhere in the world
> const user = await env.DB
>   .prepare('SELECT * FROM users WHERE email = ?')
>   .bind('user@example.com')
>   .first()
> ```
>
> **The Catch:** Eventually consistent replication means writes may take a few seconds to appear globally - design accordingly.

---

> **TL;DR - Key Takeaways**
> - **What**: SQLite-compatible database running at the edge
> - **Free Tier**: 5GB storage, 5M rows read/day, 100K rows written/day
> - **Primary Use Cases**: User data, content storage, session management, analytics
> - **Key Features**: SQL compatibility, automatic replication, zero cold starts
> - **Limitations**: Eventually consistent, 100MB/query result, no long transactions

## Production SQL Database for $0

D1 brings the power of SQLite to Cloudflare's global network, offering a real SQL database with ACID transactions, 5GB storage, and 5 million reads per day—all on the free tier. It's not a toy database; it's SQLite, the world's most deployed database, running at the edge.

### Why D1 Changes Everything

Traditional cloud databases are expensive and regionally bound:

```javascript
// Database cost comparison
const databaseComparison = {
  awsRDS: {
    minimumCost: "$15/month",
    regions: "Single region (+100ms latency elsewhere)",
    scaling: "Manual with downtime",
    storage: "20GB minimum"
  },
  
  planetscale: {
    freeTier: "10M row reads/month",
    paidStarts: "$29/month",
    regions: "Limited locations",
    scaling: "Automatic but costly"
  },
  
  cloudflareD1: {
    freeTier: "5GB storage, 5M reads/day",
    performance: "SQLite at the edge",
    scaling: "Automatic and global",
    cost: "$0"
  }
}
```

### Getting Started with D1

Create your first database:

```bash
# Create database
wrangler d1 create my-database

# Create schema
wrangler d1 execute my-database --file=./schema.sql
```

Define your schema:

```sql
-- schema.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published, created_at);
```

### Using D1 in Workers

```typescript
interface Env {
  DB: D1Database
}

export default {
  async fetch(request: Request, env: Env) {
    // Insert data
    const user = await env.DB
      .prepare('INSERT INTO users (email, name) VALUES (?, ?) RETURNING *')
      .bind('user@example.com', 'John Doe')
      .first()
    
    // Query with prepared statements
    const posts = await env.DB
      .prepare(`
        SELECT p.*, u.name as author_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.published = ?
        ORDER BY p.created_at DESC
        LIMIT ?
      `)
      .bind(true, 10)
      .all()
    
    return Response.json({
      user,
      posts: posts.results
    })
  }
}
```

### D1 Architecture

D1 leverages SQLite's strengths while solving its traditional weaknesses:

```
Traditional SQLite:
- ✅ Fast, reliable, ACID compliant
- ❌ Single-writer limitation
- ❌ No network access
- ❌ Local file only

D1's Innovation:
- ✅ All SQLite benefits
- ✅ Distributed read replicas
- ✅ Network accessible
- ✅ Automatic replication
```

### Advanced Query Patterns

#### Transactions
```typescript
export async function transferFunds(env: Env, fromId: number, toId: number, amount: number) {
  const tx = await env.DB.transaction(async (tx) => {
    // Deduct from sender
    await tx
      .prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?')
      .bind(amount, fromId, amount)
      .run()
    
    // Add to receiver
    await tx
      .prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
      .bind(amount, toId)
      .run()
    
    // Log transaction
    await tx
      .prepare('INSERT INTO transactions (from_id, to_id, amount) VALUES (?, ?, ?)')
      .bind(fromId, toId, amount)
      .run()
  })
  
  return tx
}
```

#### Batch Operations
```typescript
export async function batchInsert(env: Env, users: User[]) {
  const statements = users.map(user => 
    env.DB
      .prepare('INSERT INTO users (email, name) VALUES (?, ?)')
      .bind(user.email, user.name)
  )
  
  const results = await env.DB.batch(statements)
  return results
}
```

#### Full-Text Search
```sql
-- Create FTS5 table
CREATE VIRTUAL TABLE posts_fts USING fts5(
  title, 
  content, 
  content=posts, 
  content_rowid=id
);

-- Populate FTS index
INSERT INTO posts_fts(posts_fts) VALUES('rebuild');
```

```typescript
// Search implementation
export async function searchPosts(env: Env, query: string) {
  const results = await env.DB
    .prepare(`
      SELECT 
        posts.*,
        highlight(posts_fts, 0, '<mark>', '</mark>') as highlighted_title,
        highlight(posts_fts, 1, '<mark>', '</mark>') as highlighted_content
      FROM posts
      JOIN posts_fts ON posts.id = posts_fts.rowid
      WHERE posts_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `)
    .bind(query)
    .all()
  
  return results.results
}
```

### Real-World Patterns

#### Multi-Tenant SaaS
```typescript
// Tenant isolation pattern
export async function getTenantData(env: Env, tenantId: string, userId: string) {
  // Always filter by tenant
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE tenant_id = ? AND id = ?')
    .bind(tenantId, userId)
    .first()
  
  const subscription = await env.DB
    .prepare('SELECT * FROM subscriptions WHERE tenant_id = ?')
    .bind(tenantId)
    .first()
  
  return { user, subscription }
}

// Row-level security
export async function createPost(env: Env, tenantId: string, userId: string, post: Post) {
  return env.DB
    .prepare(`
      INSERT INTO posts (tenant_id, user_id, title, content)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `)
    .bind(tenantId, userId, post.title, post.content)
    .first()
}
```

#### Event Sourcing
```typescript
// Event store schema
const eventSchema = `
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSON NOT NULL,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX idx_events_aggregate ON events(aggregate_id, created_at);
`

// Append events
export async function appendEvent(env: Env, event: Event) {
  await env.DB
    .prepare(`
      INSERT INTO events (aggregate_id, event_type, event_data, metadata)
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      event.aggregateId,
      event.type,
      JSON.stringify(event.data),
      JSON.stringify(event.metadata)
    )
    .run()
}

// Replay events
export async function replayEvents(env: Env, aggregateId: string) {
  const events = await env.DB
    .prepare(`
      SELECT * FROM events 
      WHERE aggregate_id = ? 
      ORDER BY created_at
    `)
    .bind(aggregateId)
    .all()
  
  return events.results.reduce((state, event) => {
    return applyEvent(state, JSON.parse(event.event_data))
  }, {})
}
```

#### Time-Series Data
```typescript
// Optimized time-series schema
const timeSeriesSchema = `
  CREATE TABLE metrics (
    metric_name TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    value REAL NOT NULL,
    tags JSON,
    PRIMARY KEY (metric_name, timestamp)
  ) WITHOUT ROWID;
  
  -- Partition index for efficient queries
  CREATE INDEX idx_metrics_time ON metrics(timestamp);
`

// Efficient aggregation
export async function getMetricStats(env: Env, metric: string, hours: number) {
  const since = Date.now() - (hours * 3600 * 1000)
  
  return env.DB
    .prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', datetime(timestamp/1000, 'unixepoch')) as hour,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as data_points
      FROM metrics
      WHERE metric_name = ? AND timestamp > ?
      GROUP BY hour
      ORDER BY hour DESC
    `)
    .bind(metric, since)
    .all()
}
```

### Performance Optimization

#### Indexing Strategy
```sql
-- Covering index for common queries
CREATE INDEX idx_posts_listing ON posts(
  published, 
  created_at DESC, 
  title, 
  user_id
) WHERE published = TRUE;

-- Partial index for active records
CREATE INDEX idx_users_active ON users(email) 
WHERE deleted_at IS NULL;

-- Expression index for case-insensitive search
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
```

#### Query Optimization
```typescript
// Bad: N+1 queries
const posts = await env.DB.prepare('SELECT * FROM posts').all()
for (const post of posts.results) {
  const author = await env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(post.user_id)
    .first()
  post.author = author
}

// Good: Single query with JOIN
const posts = await env.DB
  .prepare(`
    SELECT 
      p.*,
      json_object(
        'id', u.id,
        'name', u.name,
        'email', u.email
      ) as author
    FROM posts p
    JOIN users u ON p.user_id = u.id
  `)
  .all()
```

#### Connection Pooling
```typescript
// D1 handles connection pooling automatically
// But you can optimize with caching
const cache = new Map()

export async function getCachedUser(env: Env, userId: string) {
  const cacheKey = `user:${userId}`
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }
  
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first()
  
  if (user) {
    cache.set(cacheKey, user)
    // Clear cache after 1 minute
    setTimeout(() => cache.delete(cacheKey), 60000)
  }
  
  return user
}
```

### Migrations

```typescript
// migrations/001_initial.sql
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Your schema here

// Worker migration runner
export async function runMigrations(env: Env) {
  const migrations = [
    { version: 1, sql: await readFile('001_initial.sql') },
    { version: 2, sql: await readFile('002_add_posts.sql') },
  ]
  
  for (const migration of migrations) {
    const applied = await env.DB
      .prepare('SELECT 1 FROM migrations WHERE version = ?')
      .bind(migration.version)
      .first()
    
    if (!applied) {
      await env.DB.transaction(async (tx) => {
        await tx.exec(migration.sql)
        await tx
          .prepare('INSERT INTO migrations (version) VALUES (?)')
          .bind(migration.version)
          .run()
      })
    }
  }
}
```

### Backup and Export

```typescript
// Export data
export async function exportData(env: Env) {
  const tables = ['users', 'posts', 'comments']
  const backup = {}
  
  for (const table of tables) {
    const data = await env.DB
      .prepare(`SELECT * FROM ${table}`)
      .all()
    backup[table] = data.results
  }
  
  // Store in R2
  await env.BUCKET.put(
    `backups/backup-${Date.now()}.json`,
    JSON.stringify(backup)
  )
}

// Point-in-time restore
export async function restore(env: Env, timestamp: number) {
  const backup = await env.BUCKET.get(`backups/backup-${timestamp}.json`)
  const data = await backup.json()
  
  await env.DB.transaction(async (tx) => {
    // Clear existing data
    for (const table of Object.keys(data)) {
      await tx.exec(`DELETE FROM ${table}`)
    }
    
    // Restore from backup
    for (const [table, rows] of Object.entries(data)) {
      for (const row of rows) {
        const columns = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        await tx
          .prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`)
          .bind(...Object.values(row))
          .run()
      }
    }
  })
}
```

### Monitoring and Analytics

```typescript
// Query performance tracking
export async function trackQueryPerformance(env: Env) {
  const slowQueries = await env.DB
    .prepare(`
      SELECT 
        sql,
        COUNT(*) as execution_count,
        AVG(duration) as avg_duration,
        MAX(duration) as max_duration
      FROM query_log
      WHERE duration > 100
      GROUP BY sql
      ORDER BY avg_duration DESC
      LIMIT 10
    `)
    .all()
  
  // Log to Analytics Engine
  await env.ANALYTICS.writeDataPoint({
    dataset: 'd1_performance',
    point: {
      slow_queries: slowQueries.results.length,
      timestamp: Date.now()
    }
  })
}
```

### D1 Limits and Considerations

```typescript
const d1FreeTier = {
  storage: "5GB total",
  reads: "5 million/day",
  writes: "100,000/day",
  databases: "10 per account",
  maxQueryTime: "30 seconds",
  maxResultSize: "100MB",
}

const bestPractices = {
  indexes: "Create indexes for all WHERE/JOIN columns",
  transactions: "Keep transactions short",
  batching: "Use batch() for multiple operations",
  caching: "Cache frequently accessed data in KV",
  archiving: "Move old data to R2"
}
```

### D1 vs Traditional Databases

```javascript
// Performance comparison
const performance = {
  d1: {
    readLatency: "5-10ms at edge",
    writeLatency: "20-50ms globally",
    consistency: "Strong consistency"
  },
  postgres_regional: {
    readLatency: "5-200ms (depends on distance)",
    writeLatency: "10-300ms (depends on distance)",
    consistency: "Strong consistency"
  },
  dynamodb: {
    readLatency: "10-20ms in region",
    writeLatency: "10-20ms in region",
    consistency: "Eventual by default"
  }
}
```

### Summary

D1 brings production-grade SQL to the edge with zero cost. By leveraging SQLite's battle-tested reliability and Cloudflare's global network, it offers a unique combination of performance, features, and economics. The 5GB storage and 5 million daily reads support substantial applications—far beyond typical "free tier" limitations. It's the ideal solution for any application needing a relational database for structured data, from user accounts to complex application state.

---

*Next: KV Store - Lightning-fast key-value storage at the edge*