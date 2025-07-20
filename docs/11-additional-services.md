# Additional Services: Completing the Stack

## Beyond the Core Services

While Pages, Workers, D1, KV, R2, Vectorize, and Workers AI form the foundation of your $0 infrastructure, Cloudflare offers additional services that complete a production-ready stack. These services handle specific use cases that round out your application's capabilities.

### Queues: Reliable Message Processing

Queues enables asynchronous processing with at-least-once delivery guarantees. Perfect for background jobs, webhooks, and event-driven architectures.

```typescript
// Producer
export default {
  async fetch(request: Request, env: Env) {
    // Add message to queue
    await env.QUEUE.send({
      type: 'process_upload',
      fileId: 'abc123',
      userId: 'user456',
      timestamp: Date.now()
    })
    
    return Response.json({ status: 'queued' })
  }
}

// Consumer
export default {
  async queue(batch: MessageBatch<any>, env: Env) {
    for (const message of batch.messages) {
      try {
        await processMessage(message.body, env)
        message.ack() // Acknowledge successful processing
      } catch (error) {
        message.retry() // Retry later
      }
    }
  }
}
```

#### Real-World Queue Patterns

```typescript
// Email notification system
export class NotificationQueue {
  async sendEmail(env: Env, email: {
    to: string
    subject: string
    template: string
    data: Record<string, any>
  }) {
    await env.EMAIL_QUEUE.send({
      ...email,
      attemptCount: 0,
      maxAttempts: 3
    })
  }
}

// Image processing pipeline
export class ImageProcessor {
  async processUpload(env: Env, upload: {
    key: string
    userId: string
  }) {
    // Queue multiple processing tasks
    await env.QUEUE.send([
      { task: 'generate_thumbnail', ...upload },
      { task: 'extract_metadata', ...upload },
      { task: 'scan_content', ...upload },
      { task: 'index_search', ...upload }
    ])
  }
}

// Webhook delivery with retries
export class WebhookDelivery {
  async queue(batch: MessageBatch<any>, env: Env) {
    for (const message of batch.messages) {
      const webhook = message.body
      
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhook.payload)
        })
        
        if (response.ok) {
          message.ack()
        } else if (webhook.attemptCount < 5) {
          // Exponential backoff
          const delay = Math.pow(2, webhook.attemptCount) * 1000
          message.retry({ delaySeconds: delay / 1000 })
        } else {
          // Max attempts reached, dead letter
          await env.DEAD_LETTER.send(webhook)
          message.ack()
        }
      } catch (error) {
        message.retry()
      }
    }
  }
}
```

### Durable Objects: Stateful Edge Computing

Durable Objects provide strong consistency and real-time coordination. Each object is a single-threaded JavaScript environment with persistent state.

```typescript
// Chat room implementation
export class ChatRoom {
  state: DurableObjectState
  sessions: Set<WebSocket> = new Set()
  messages: Array<any> = []
  
  constructor(state: DurableObjectState) {
    this.state = state
  }
  
  async fetch(request: Request) {
    const url = new URL(request.url)
    
    if (url.pathname === '/websocket') {
      return this.handleWebSocket(request)
    }
    
    if (url.pathname === '/history') {
      return Response.json({ messages: this.messages })
    }
  }
  
  async handleWebSocket(request: Request) {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    
    this.state.acceptWebSocket(server)
    this.sessions.add(server)
    
    server.addEventListener('message', async (event) => {
      const message = JSON.parse(event.data)
      
      // Store message
      this.messages.push({
        ...message,
        timestamp: Date.now()
      })
      
      // Keep last 100 messages
      if (this.messages.length > 100) {
        this.messages = this.messages.slice(-100)
      }
      
      // Broadcast to all connected clients
      const broadcast = JSON.stringify(message)
      for (const session of this.sessions) {
        try {
          session.send(broadcast)
        } catch (error) {
          // Remove dead connections
          this.sessions.delete(session)
        }
      }
    })
    
    server.addEventListener('close', () => {
      this.sessions.delete(server)
    })
    
    return new Response(null, { status: 101, webSocket: client })
  }
}

// Collaborative editor
export class DocumentEditor {
  state: DurableObjectState
  document: { content: string; version: number }
  activeUsers: Map<string, { cursor: number; selection: any }>
  
  constructor(state: DurableObjectState) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      this.document = await this.state.storage.get('document') || {
        content: '',
        version: 0
      }
      this.activeUsers = new Map()
    })
  }
  
  async applyOperation(operation: {
    type: 'insert' | 'delete'
    position: number
    text?: string
    length?: number
    userId: string
  }) {
    // Apply operational transform
    if (operation.type === 'insert') {
      this.document.content = 
        this.document.content.slice(0, operation.position) +
        operation.text +
        this.document.content.slice(operation.position)
    } else {
      this.document.content = 
        this.document.content.slice(0, operation.position) +
        this.document.content.slice(operation.position + operation.length!)
    }
    
    this.document.version++
    
    // Persist state
    await this.state.storage.put('document', this.document)
    
    // Broadcast to all users
    this.broadcast({
      type: 'operation',
      operation,
      version: this.document.version
    })
  }
}
```

### Email Routing: Programmatic Email Handling

Email Routing lets you process incoming emails with Workers, enabling email-to-webhook, automated responses, and email parsing.

```typescript
export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    // Parse email
    const subject = message.headers.get('subject')
    const from = message.from
    
    // Route based on address
    if (message.to.includes('support@')) {
      // Create support ticket
      await env.DB.prepare(`
        INSERT INTO tickets (email, subject, body, status)
        VALUES (?, ?, ?, 'open')
      `).bind(from, subject, await message.text()).run()
      
      // Auto-reply
      await message.reply({
        html: `<p>Thank you for contacting support. Ticket created.</p>`
      })
    }
    
    if (message.to.includes('upload@')) {
      // Process attachments
      for (const attachment of message.attachments) {
        const key = `email-attachments/${Date.now()}-${attachment.name}`
        await env.BUCKET.put(key, attachment.content)
      }
    }
    
    // Forward to webhook
    await fetch('https://api.example.com/email-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: message.to,
        subject,
        text: await message.text(),
        attachments: message.attachments.length
      })
    })
  }
}
```

### Analytics Engine: Custom Analytics Without Cookies

Analytics Engine provides privacy-first analytics with SQL querying capabilities.

```typescript
export class Analytics {
  constructor(private analytics: AnalyticsEngineDataset) {}
  
  async trackPageView(request: Request, response: Response) {
    const url = new URL(request.url)
    
    await this.analytics.writeDataPoint({
      dataset: 'web_analytics',
      point: {
        // Dimensions
        path: url.pathname,
        method: request.method,
        country: request.cf?.country || 'unknown',
        device: this.getDeviceType(request),
        
        // Metrics  
        status: response.status,
        responseTime: Date.now(),
        
        // Privacy-first: no cookies or IPs
        timestamp: Date.now()
      }
    })
  }
  
  async trackCustomEvent(event: {
    category: string
    action: string
    label?: string
    value?: number
    userId?: string
  }) {
    await this.analytics.writeDataPoint({
      dataset: 'events',
      point: {
        category: event.category,
        action: event.action,
        label: event.label || '',
        value: event.value || 0,
        userId: event.userId ? this.hashUserId(event.userId) : 'anonymous',
        timestamp: Date.now()
      }
    })
  }
  
  private getDeviceType(request: Request): string {
    const ua = request.headers.get('user-agent') || ''
    if (/mobile/i.test(ua)) return 'mobile'
    if (/tablet/i.test(ua)) return 'tablet'
    return 'desktop'
  }
  
  private hashUserId(userId: string): string {
    // One-way hash for privacy
    return btoa(userId).slice(0, 16)
  }
}

// Query analytics with SQL
const query = `
  SELECT 
    path,
    COUNT(*) as views,
    COUNT(DISTINCT session_id) as unique_visitors,
    AVG(response_time) as avg_load_time
  FROM web_analytics
  WHERE timestamp > NOW() - INTERVAL '7 days'
  GROUP BY path
  ORDER BY views DESC
  LIMIT 10
`
```

### Browser Rendering: Screenshots and PDFs

Browser Rendering API allows you to capture screenshots and generate PDFs using headless Chrome.

```typescript
export class BrowserRenderer {
  async screenshot(url: string, options: {
    viewport?: { width: number; height: number }
    fullPage?: boolean
    quality?: number
  } = {}): Promise<Blob> {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    
    if (options.viewport) {
      await page.setViewport(options.viewport)
    }
    
    await page.goto(url, { waitUntil: 'networkidle0' })
    
    const screenshot = await page.screenshot({
      fullPage: options.fullPage || false,
      type: 'jpeg',
      quality: options.quality || 80
    })
    
    await browser.close()
    
    return new Blob([screenshot], { type: 'image/jpeg' })
  }
  
  async generatePDF(html: string, options: {
    format?: 'A4' | 'Letter'
    margin?: { top: string; bottom: string; left: string; right: string }
  } = {}): Promise<Blob> {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    
    await page.setContent(html, { waitUntil: 'networkidle0' })
    
    const pdf = await page.pdf({
      format: options.format || 'A4',
      margin: options.margin || {
        top: '1in',
        bottom: '1in',
        left: '1in',
        right: '1in'
      }
    })
    
    await browser.close()
    
    return new Blob([pdf], { type: 'application/pdf' })
  }
}

// Invoice generation example
export async function generateInvoice(env: Env, invoice: any) {
  const renderer = new BrowserRenderer()
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Invoice styles */
        </style>
      </head>
      <body>
        <h1>Invoice #${invoice.number}</h1>
        <!-- Invoice content -->
      </body>
    </html>
  `
  
  const pdf = await renderer.generatePDF(html)
  
  // Store in R2
  await env.BUCKET.put(`invoices/${invoice.number}.pdf`, pdf)
  
  return pdf
}
```

### Hyperdrive: Database Connection Pooling

Hyperdrive provides connection pooling for external databases, reducing latency and connection overhead.

```typescript
export default {
  async fetch(request: Request, env: Env) {
    // Connect to external Postgres via Hyperdrive
    const client = new Client({
      connectionString: env.HYPERDRIVE_URL
    })
    
    await client.connect()
    
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [request.params.id]
      )
      
      return Response.json(result.rows[0])
    } finally {
      await client.end()
    }
  }
}
```

### Turnstile: Privacy-First CAPTCHA

Turnstile provides bot protection without the user friction of traditional CAPTCHAs.

```typescript
export async function verifyTurnstile(
  token: string,
  secret: string
): Promise<boolean> {
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token
      })
    }
  )
  
  const data = await response.json()
  return data.success
}

// In your Worker
export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'POST') {
      const { token, ...formData } = await request.json()
      
      const verified = await verifyTurnstile(token, env.TURNSTILE_SECRET)
      
      if (!verified) {
        return new Response('Bot detected', { status: 403 })
      }
      
      // Process legitimate request
      return handleFormSubmission(formData)
    }
  }
}
```

### Service Limits Summary

```typescript
const additionalServiceLimits = {
  queues: {
    messages: "100K/day free",
    messageSize: "128KB max",
    retention: "4 days"
  },
  durableObjects: {
    requests: "1M/month free",
    storage: "50MB per object",
    concurrency: "Single-threaded"
  },
  emailRouting: {
    addresses: "Unlimited",
    rules: "200 per zone",
    size: "25MB per email"
  },
  analyticsEngine: {
    writes: "100K/day free",
    retention: "90 days",
    queries: "Unlimited"
  },
  browserRendering: {
    included: "1000/month free",
    timeout: "60 seconds",
    concurrency: "2 browsers"
  },
  turnstile: {
    verifications: "1M/month free",
    widgets: "Unlimited"
  }
}
```

### Choosing the Right Service

```javascript
const serviceSelector = {
  // Real-time features
  "websockets": "Durable Objects",
  "collaboration": "Durable Objects",
  "gaming": "Durable Objects",
  
  // Background processing
  "emailProcessing": "Queues + Email Routing",
  "webhooks": "Queues",
  "batchJobs": "Queues + Cron Triggers",
  
  // Analytics
  "userTracking": "Analytics Engine",
  "customMetrics": "Analytics Engine",
  "privacyFirst": "Analytics Engine (no cookies)",
  
  // Document generation
  "invoices": "Browser Rendering",
  "reports": "Browser Rendering + R2",
  "screenshots": "Browser Rendering",
  
  // External data
  "postgres": "Hyperdrive",
  "mysql": "Hyperdrive",
  "mongodb": "Direct fetch (no pooling)"
}
```

### Integration Example: Complete Application

```typescript
// Combining multiple services for a SaaS application
export class SaaSPlatform {
  async handleRequest(request: Request, env: Env) {
    const url = new URL(request.url)
    
    // Protect forms with Turnstile
    if (url.pathname === '/api/register') {
      const { token, ...data } = await request.json()
      
      if (!await verifyTurnstile(token, env.TURNSTILE_SECRET)) {
        return new Response('Invalid captcha', { status: 403 })
      }
      
      // Create user in D1
      const user = await this.createUser(data, env)
      
      // Queue welcome email
      await env.EMAIL_QUEUE.send({
        type: 'welcome',
        userId: user.id,
        email: user.email
      })
      
      // Track analytics
      await env.ANALYTICS.writeDataPoint({
        dataset: 'signups',
        point: {
          source: request.headers.get('referer'),
          timestamp: Date.now()
        }
      })
      
      return Response.json({ success: true })
    }
    
    // WebSocket for real-time features
    if (url.pathname.startsWith('/ws/')) {
      const roomId = url.pathname.split('/')[2]
      const id = env.ROOMS.idFromName(roomId)
      const room = env.ROOMS.get(id)
      
      return room.fetch(request)
    }
    
    // Generate reports
    if (url.pathname === '/api/report') {
      const report = await this.generateReport(env)
      
      // Queue PDF generation
      await env.QUEUE.send({
        type: 'generate_pdf',
        reportId: report.id,
        userId: request.userId
      })
      
      return Response.json({ reportId: report.id })
    }
  }
}
```

### Summary

These additional services enable sophisticated applications that would typically require multiple vendors and significant costs. Each service solves specific needs:

- **Queues**: Reliable async processing and background jobs
- **Durable Objects**: Stateful computing for real-time features and coordination
- **Email Routing**: Programmatic email handling and automation
- **Analytics Engine**: Privacy-first custom analytics
- **Browser Rendering**: Screenshot and PDF generation
- **Turnstile**: Bot protection without user friction

Understanding when to use each service is key to building complete production applications on Cloudflare's platform.

---

*Next: Integration Cookbook - Connecting third-party services*