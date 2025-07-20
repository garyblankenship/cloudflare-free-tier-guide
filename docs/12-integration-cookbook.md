# Integration Cookbook: Connecting Third-Party Services

## Building Complete Applications with External Services

Now that we've explored Cloudflare's comprehensive service offerings, let's address a crucial aspect of real-world applications: integrating with third-party services. While Cloudflare provides the infrastructure foundation, most applications need authentication, payment processing, email delivery, and analytics. This cookbook demonstrates how to connect these essential services while maximizing the value of your $0 infrastructure.

### Core Integration Principles

```typescript
const integrationStrategy = {
  auth: "Stateless JWT validation at edge",
  payments: "Webhook processing with Queues",
  email: "Transactional only, batch with Queues",
  analytics: "Edge collection, batch upload",
  cdn: "Cache external API responses in KV"
}
```

## Authentication Providers

### Clerk Integration
Clerk offers a generous free tier (5,000 monthly active users) and edge-friendly architecture.

```typescript
// workers/auth-middleware.ts
import { Hono } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://your-app.clerk.accounts.dev/.well-known/jwks.json')
)

export async function clerkAuth(c: any, next: any) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  
  if (!token) {
    return c.json({ error: 'No token provided' }, 401)
  }
  
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://your-app.clerk.accounts.dev',
    })
    
    // Cache user data in KV for faster subsequent requests
    const userKey = `user:${payload.sub}`
    let userData = await c.env.KV.get(userKey, 'json')
    
    if (!userData) {
      // Fetch full user data from Clerk
      userData = await fetchClerkUser(payload.sub, c.env.CLERK_SECRET)
      
      // Cache for 5 minutes
      await c.env.KV.put(userKey, JSON.stringify(userData), {
        expirationTtl: 300
      })
    }
    
    c.set('user', userData)
    await next()
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

// Webhook handler for Clerk events
export async function handleClerkWebhook(c: any) {
  const svix_id = c.req.header('svix-id')
  const svix_timestamp = c.req.header('svix-timestamp')
  const svix_signature = c.req.header('svix-signature')
  
  const body = await c.req.text()
  
  // Verify webhook signature
  const wh = new Webhook(c.env.CLERK_WEBHOOK_SECRET)
  const evt = wh.verify(body, {
    'svix-id': svix_id,
    'svix-timestamp': svix_timestamp,
    'svix-signature': svix_signature,
  })
  
  // Queue event for processing
  await c.env.AUTH_QUEUE.send({
    type: evt.type,
    data: evt.data,
    timestamp: Date.now()
  })
  
  return c.text('OK')
}

// Queue consumer for auth events
export async function processAuthEvents(batch: MessageBatch, env: Env) {
  for (const message of batch.messages) {
    const { type, data } = message.body
    
    switch (type) {
      case 'user.created':
        await env.DB.prepare(`
          INSERT INTO users (id, email, name, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(
          data.id,
          data.email_addresses[0].email_address,
          `${data.first_name} ${data.last_name}`,
          new Date(data.created_at).toISOString()
        ).run()
        break
        
      case 'user.deleted':
        // Soft delete to maintain referential integrity
        await env.DB.prepare(`
          UPDATE users SET deleted_at = ? WHERE id = ?
        `).bind(new Date().toISOString(), data.id).run()
        break
    }
    
    message.ack()
  }
}
```

### Auth0 Integration
Auth0's free tier includes 7,000 active users and works well with edge computing.

```typescript
// Edge-optimized Auth0 integration
export class Auth0Integration {
  private jwksClient: any
  
  constructor(private domain: string, private audience: string) {
    this.jwksClient = createRemoteJWKSet(
      new URL(`https://${domain}/.well-known/jwks.json`)
    )
  }
  
  async verifyToken(token: string): Promise<any> {
    try {
      const { payload } = await jwtVerify(token, this.jwksClient, {
        issuer: `https://${this.domain}/`,
        audience: this.audience,
      })
      
      return payload
    } catch (error) {
      throw new Error('Invalid token')
    }
  }
  
  // Management API calls with caching
  async getUser(userId: string, env: Env): Promise<any> {
    const cacheKey = `auth0:user:${userId}`
    const cached = await env.KV.get(cacheKey, 'json')
    
    if (cached) return cached
    
    const mgmtToken = await this.getManagementToken(env)
    
    const response = await fetch(
      `https://${this.domain}/api/v2/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${mgmtToken}`,
        }
      }
    )
    
    const user = await response.json()
    
    // Cache user data
    await env.KV.put(cacheKey, JSON.stringify(user), {
      expirationTtl: 3600 // 1 hour
    })
    
    return user
  }
  
  private async getManagementToken(env: Env): Promise<string> {
    // Cache management token
    const cached = await env.KV.get('auth0:mgmt:token')
    if (cached) return cached
    
    const response = await fetch(`https://${this.domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.AUTH0_CLIENT_ID,
        client_secret: env.AUTH0_CLIENT_SECRET,
        audience: `https://${this.domain}/api/v2/`,
        grant_type: 'client_credentials',
      })
    })
    
    const { access_token, expires_in } = await response.json()
    
    // Cache with expiration
    await env.KV.put('auth0:mgmt:token', access_token, {
      expirationTtl: expires_in - 300 // 5 min buffer
    })
    
    return access_token
  }
}
```

### Supabase Auth Integration
Supabase offers generous free tier with 50,000 monthly active users.

```typescript
// Supabase edge integration
export class SupabaseAuth {
  constructor(
    private supabaseUrl: string,
    private supabaseAnonKey: string
  ) {}
  
  async verifyToken(token: string, env: Env): Promise<any> {
    // Verify JWT with Supabase's public key
    const JWKS = createRemoteJWKSet(
      new URL(`${this.supabaseUrl}/auth/v1/jwks`)
    )
    
    const { payload } = await jwtVerify(token, JWKS)
    
    // Sync user to D1 if needed
    await this.syncUser(payload, env)
    
    return payload
  }
  
  private async syncUser(payload: any, env: Env) {
    const existing = await env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(payload.sub)
      .first()
    
    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO users (id, email, metadata, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(
        payload.sub,
        payload.email,
        JSON.stringify(payload.user_metadata || {}),
        new Date().toISOString()
      ).run()
    }
  }
  
  // Handle Supabase webhooks
  async handleWebhook(request: Request, env: Env): Promise<Response> {
    const signature = request.headers.get('webhook-signature')
    const body = await request.text()
    
    // Verify webhook
    if (!this.verifyWebhookSignature(body, signature, env.SUPABASE_WEBHOOK_SECRET)) {
      return new Response('Invalid signature', { status: 401 })
    }
    
    const event = JSON.parse(body)
    
    // Queue for processing
    await env.AUTH_QUEUE.send(event)
    
    return new Response('OK')
  }
  
  private verifyWebhookSignature(
    body: string,
    signature: string,
    secret: string
  ): boolean {
    // Implementation depends on Supabase's webhook signing method
    return true
  }
}
```

## Payment Processing

### Stripe Integration
Stripe's webhook-based architecture works perfectly with Workers and Queues.

```typescript
// Stripe webhook handler with signature verification
import Stripe from 'stripe'

export class StripeIntegration {
  private stripe: Stripe
  
  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(), // Use fetch for Workers
    })
  }
  
  async handleWebhook(request: Request, env: Env): Promise<Response> {
    const signature = request.headers.get('stripe-signature')!
    const body = await request.text()
    
    let event: Stripe.Event
    
    try {
      event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      return new Response('Invalid signature', { status: 400 })
    }
    
    // Queue event for processing
    await env.PAYMENT_QUEUE.send({
      id: event.id,
      type: event.type,
      data: event.data,
      created: event.created
    })
    
    // Immediate response to Stripe
    return new Response('OK')
  }
  
  // Payment intent creation with idempotency
  async createPaymentIntent(params: {
    amount: number
    currency: string
    customerId: string
    metadata?: Record<string, string>
  }, env: Env): Promise<any> {
    const idempotencyKey = `pi_${params.customerId}_${Date.now()}`
    
    // Check if already created
    const existing = await env.KV.get(`stripe:pi:${idempotencyKey}`)
    if (existing) return JSON.parse(existing)
    
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      customer: params.customerId,
      metadata: params.metadata,
    }, {
      idempotencyKey
    })
    
    // Cache the payment intent
    await env.KV.put(
      `stripe:pi:${idempotencyKey}`,
      JSON.stringify(paymentIntent),
      { expirationTtl: 3600 }
    )
    
    return paymentIntent
  }
}

// Queue processor for Stripe events
export async function processStripeEvents(batch: MessageBatch, env: Env) {
  const stripe = new StripeIntegration(env.STRIPE_API_KEY)
  
  for (const message of batch.messages) {
    const event = message.body
    
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentSuccess(event.data.object, env)
          break
          
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await syncSubscription(event.data.object, env)
          break
          
        case 'customer.subscription.deleted':
          await handleSubscriptionCancellation(event.data.object, env)
          break
          
        case 'invoice.payment_failed':
          await handleFailedPayment(event.data.object, env)
          break
      }
      
      message.ack()
    } catch (error) {
      // Retry logic
      if (message.attempts < 3) {
        message.retry({ delaySeconds: Math.pow(2, message.attempts) * 60 })
      } else {
        // Send to dead letter queue
        await env.DEAD_LETTER_QUEUE.send({
          event,
          error: error.message,
          attempts: message.attempts
        })
        message.ack()
      }
    }
  }
}

async function handlePaymentSuccess(paymentIntent: any, env: Env) {
  // Update order status
  await env.DB.prepare(`
    UPDATE orders 
    SET status = 'paid', paid_at = ?, payment_intent_id = ?
    WHERE id = ?
  `).bind(
    new Date().toISOString(),
    paymentIntent.id,
    paymentIntent.metadata.order_id
  ).run()
  
  // Queue order fulfillment
  await env.FULFILLMENT_QUEUE.send({
    orderId: paymentIntent.metadata.order_id,
    customerId: paymentIntent.customer
  })
}

async function syncSubscription(subscription: any, env: Env) {
  await env.DB.prepare(`
    INSERT INTO subscriptions (
      id, customer_id, status, current_period_end, plan_id
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      plan_id = excluded.plan_id
  `).bind(
    subscription.id,
    subscription.customer,
    subscription.status,
    new Date(subscription.current_period_end * 1000).toISOString(),
    subscription.items.data[0].price.id
  ).run()
}
```

### Paddle Integration
Paddle handles tax compliance and acts as merchant of record.

```typescript
// Paddle webhook handler
export class PaddleIntegration {
  async handleWebhook(request: Request, env: Env): Promise<Response> {
    const body = await request.formData()
    const signature = body.get('p_signature')
    
    // Verify webhook
    if (!this.verifySignature(body, signature, env.PADDLE_PUBLIC_KEY)) {
      return new Response('Invalid signature', { status: 401 })
    }
    
    const eventType = body.get('alert_name')
    
    // Queue for processing
    await env.PAYMENT_QUEUE.send({
      type: eventType,
      data: Object.fromEntries(body.entries()),
      timestamp: Date.now()
    })
    
    return new Response('OK')
  }
  
  private verifySignature(
    body: FormData,
    signature: string,
    publicKey: string
  ): boolean {
    // Paddle signature verification
    const data = new URLSearchParams()
    for (const [key, value] of body.entries()) {
      if (key !== 'p_signature') {
        data.append(key, value.toString())
      }
    }
    
    // Verify with public key (implementation depends on crypto library)
    return true
  }
  
  // Subscription management
  async updateSubscription(
    subscriptionId: string,
    updates: any,
    env: Env
  ): Promise<void> {
    const response = await fetch(
      'https://vendors.paddle.com/api/2.0/subscription/users/update',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: env.PADDLE_VENDOR_ID,
          vendor_auth_code: env.PADDLE_AUTH_CODE,
          subscription_id: subscriptionId,
          ...updates
        })
      }
    )
    
    if (!response.ok) {
      throw new Error('Failed to update subscription')
    }
  }
}
```

## Email Services

### Resend Integration
Resend offers 3,000 free emails/month with great developer experience.

```typescript
// Email service with queue batching
export class EmailService {
  constructor(private resendApiKey: string) {}
  
  // Queue email for sending
  async queueEmail(env: Env, email: {
    to: string | string[]
    subject: string
    template: string
    data: Record<string, any>
    tags?: string[]
  }) {
    await env.EMAIL_QUEUE.send({
      provider: 'resend',
      email,
      timestamp: Date.now()
    })
  }
  
  // Batch processor for email queue
  async processEmailBatch(batch: MessageBatch, env: Env) {
    const emails = batch.messages.map(m => m.body.email)
    
    // Group by template for batch sending
    const grouped = this.groupByTemplate(emails)
    
    for (const [template, group] of grouped) {
      try {
        await this.sendBatch(group, env)
        
        // Ack all messages in group
        group.forEach(({ message }) => message.ack())
      } catch (error) {
        // Retry individual emails
        group.forEach(({ message, email }) => {
          message.retry({ delaySeconds: 300 })
        })
      }
    }
  }
  
  private async sendBatch(emails: any[], env: Env) {
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        emails.map(({ email }) => ({
          from: env.FROM_EMAIL,
          to: email.to,
          subject: email.subject,
          html: await this.renderTemplate(email.template, email.data),
          tags: email.tags,
        }))
      )
    })
    
    if (!response.ok) {
      throw new Error(`Email batch failed: ${response.statusText}`)
    }
    
    // Log sent emails
    const results = await response.json()
    await this.logEmailsSent(results.data, env)
  }
  
  private async renderTemplate(
    template: string,
    data: Record<string, any>
  ): Promise<string> {
    // Simple template rendering - in production use a proper engine
    let html = templates[template] || ''
    
    for (const [key, value] of Object.entries(data)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }
    
    return html
  }
  
  private async logEmailsSent(emails: any[], env: Env) {
    const logs = emails.map(email => ({
      id: email.id,
      to: email.to,
      subject: email.subject,
      sent_at: new Date().toISOString()
    }))
    
    // Batch insert to D1
    await env.DB.batch(
      logs.map(log =>
        env.DB.prepare(`
          INSERT INTO email_logs (id, to_email, subject, sent_at)
          VALUES (?, ?, ?, ?)
        `).bind(log.id, log.to, log.subject, log.sent_at)
      )
    )
  }
}

// Email templates
const templates = {
  welcome: `
    <h1>Welcome {{name}}!</h1>
    <p>Thanks for joining our platform.</p>
  `,
  
  order_confirmation: `
    <h1>Order Confirmed</h1>
    <p>Order #{{orderId}} has been confirmed.</p>
    <p>Total: {{total}}</p>
  `,
  
  password_reset: `
    <h1>Reset Your Password</h1>
    <p>Click <a href="{{resetLink}}">here</a> to reset your password.</p>
  `
}
```

### SendGrid Integration
SendGrid offers 100 emails/day free forever.

```typescript
// SendGrid with template caching
export class SendGridService {
  private templates = new Map<string, any>()
  
  constructor(private apiKey: string) {}
  
  async sendEmail(params: {
    to: string
    templateId: string
    dynamicData: Record<string, any>
  }, env: Env): Promise<void> {
    // Get cached template
    let template = this.templates.get(params.templateId)
    
    if (!template) {
      template = await this.getTemplate(params.templateId)
      this.templates.set(params.templateId, template)
    }
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: params.to }],
          dynamic_template_data: params.dynamicData,
        }],
        from: { email: env.FROM_EMAIL },
        template_id: params.templateId,
      })
    })
    
    if (!response.ok) {
      throw new Error(`SendGrid error: ${response.statusText}`)
    }
  }
  
  private async getTemplate(templateId: string): Promise<any> {
    const response = await fetch(
      `https://api.sendgrid.com/v3/templates/${templateId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      }
    )
    
    return response.json()
  }
}
```

## SMS Services

### Twilio Integration
Twilio's pay-as-you-go model works well with event-driven architectures.

```typescript
// Twilio SMS with rate limiting
export class TwilioService {
  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string
  ) {}
  
  async sendSMS(to: string, body: string, env: Env): Promise<void> {
    // Rate limit check
    const rateLimitKey = `sms:rate:${to}`
    const count = parseInt(await env.KV.get(rateLimitKey) || '0')
    
    if (count >= 5) { // 5 SMS per hour per number
      throw new Error('SMS rate limit exceeded')
    }
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: this.fromNumber,
          Body: body,
        })
      }
    )
    
    if (!response.ok) {
      throw new Error(`Twilio error: ${response.statusText}`)
    }
    
    // Update rate limit
    await env.KV.put(rateLimitKey, (count + 1).toString(), {
      expirationTtl: 3600 // 1 hour
    })
    
    // Log SMS
    const result = await response.json()
    await env.DB.prepare(`
      INSERT INTO sms_logs (sid, to_number, body, status, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      result.sid,
      to,
      body,
      result.status,
      new Date().toISOString()
    ).run()
  }
  
  // Handle status callbacks
  async handleStatusCallback(request: Request, env: Env): Promise<Response> {
    const formData = await request.formData()
    const sid = formData.get('MessageSid')
    const status = formData.get('MessageStatus')
    
    await env.DB.prepare(`
      UPDATE sms_logs SET status = ? WHERE sid = ?
    `).bind(status, sid).run()
    
    return new Response('OK')
  }
}
```

## Analytics Services

### Mixpanel Integration
Mixpanel offers 100K monthly tracked users free.

```typescript
// Edge-optimized Mixpanel tracking
export class MixpanelService {
  private queue: any[] = []
  private flushTimer: number | null = null
  
  constructor(private projectToken: string) {}
  
  track(event: string, properties: Record<string, any>, env: Env) {
    this.queue.push({
      event,
      properties: {
        ...properties,
        time: Date.now(),
        distinct_id: properties.userId || 'anonymous',
        $insert_id: crypto.randomUUID(),
      }
    })
    
    // Auto-flush after 10 events or 5 seconds
    if (this.queue.length >= 10) {
      this.flush(env)
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(env), 5000)
    }
  }
  
  async flush(env: Env) {
    if (this.queue.length === 0) return
    
    const events = [...this.queue]
    this.queue = []
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    
    // Batch send to Mixpanel
    const response = await fetch('https://api.mixpanel.com/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events.map(e => ({
        event: e.event,
        properties: {
          ...e.properties,
          token: this.projectToken,
        }
      })))
    })
    
    if (!response.ok) {
      // Queue failed events for retry
      await env.ANALYTICS_QUEUE.send({
        provider: 'mixpanel',
        events,
        attempts: 1
      })
    }
  }
  
  // User profile updates
  async updateUserProfile(
    userId: string,
    properties: Record<string, any>
  ): Promise<void> {
    const response = await fetch('https://api.mixpanel.com/engage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        $token: this.projectToken,
        $distinct_id: userId,
        $set: properties,
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to update user profile')
    }
  }
}

// Analytics middleware
export function analyticsMiddleware(mixpanel: MixpanelService) {
  return async (c: any, next: any) => {
    const start = Date.now()
    
    await next()
    
    // Track API request
    mixpanel.track('api_request', {
      path: c.req.path,
      method: c.req.method,
      status: c.res.status,
      duration: Date.now() - start,
      userId: c.get('user')?.id,
      ip: c.req.header('CF-Connecting-IP'),
      country: c.req.header('CF-IPCountry'),
    }, c.env)
  }
}
```

### PostHog Integration
PostHog offers 1M events/month free with self-serve analytics.

```typescript
// PostHog edge integration
export class PostHogService {
  constructor(
    private apiKey: string,
    private host: string = 'https://app.posthog.com'
  ) {}
  
  async capture(params: {
    distinctId: string
    event: string
    properties?: Record<string, any>
    timestamp?: Date
  }, env: Env): Promise<void> {
    // Batch events in KV
    const batchKey = `posthog:batch:${Date.now()}`
    const batch = await env.KV.get(batchKey, 'json') || []
    
    batch.push({
      distinct_id: params.distinctId,
      event: params.event,
      properties: {
        ...params.properties,
        $lib: 'cloudflare-workers',
        $lib_version: '1.0.0',
      },
      timestamp: params.timestamp || new Date(),
    })
    
    await env.KV.put(batchKey, JSON.stringify(batch), {
      expirationTtl: 60 // 1 minute
    })
    
    // Flush if batch is large enough
    if (batch.length >= 20) {
      await this.flushBatch(batch, env)
      await env.KV.delete(batchKey)
    }
  }
  
  private async flushBatch(batch: any[], env: Env): Promise<void> {
    const response = await fetch(`${this.host}/batch/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        batch,
      })
    })
    
    if (!response.ok) {
      // Queue for retry
      await env.ANALYTICS_QUEUE.send({
        provider: 'posthog',
        batch,
        attempts: 1
      })
    }
  }
  
  // Feature flags with caching
  async getFeatureFlags(distinctId: string, env: Env): Promise<Record<string, boolean>> {
    const cacheKey = `posthog:flags:${distinctId}`
    const cached = await env.KV.get(cacheKey, 'json')
    
    if (cached) return cached
    
    const response = await fetch(`${this.host}/decide/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        distinct_id: distinctId,
      })
    })
    
    const data = await response.json()
    const flags = data.featureFlags || {}
    
    // Cache for 5 minutes
    await env.KV.put(cacheKey, JSON.stringify(flags), {
      expirationTtl: 300
    })
    
    return flags
  }
}
```

## File Storage & CDN

### Cloudinary Integration
Cloudinary offers 25GB storage and 25GB bandwidth free.

```typescript
// Cloudinary with R2 backup
export class CloudinaryService {
  constructor(
    private cloudName: string,
    private apiKey: string,
    private apiSecret: string
  ) {}
  
  async uploadImage(
    file: File,
    options: {
      folder?: string
      transformation?: string
      backup?: boolean
    },
    env: Env
  ): Promise<{
    url: string
    publicId: string
    format: string
  }> {
    // Generate signature
    const timestamp = Math.round(Date.now() / 1000)
    const params = {
      timestamp,
      folder: options.folder,
      transformation: options.transformation,
    }
    
    const signature = this.generateSignature(params)
    
    // Upload to Cloudinary
    const formData = new FormData()
    formData.append('file', file)
    formData.append('api_key', this.apiKey)
    formData.append('timestamp', timestamp.toString())
    formData.append('signature', signature)
    
    if (options.folder) {
      formData.append('folder', options.folder)
    }
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    )
    
    const result = await response.json()
    
    // Backup to R2 if requested
    if (options.backup) {
      await env.BUCKET.put(
        `cloudinary-backup/${result.public_id}.${result.format}`,
        file,
        {
          customMetadata: {
            cloudinaryUrl: result.secure_url,
            uploadedAt: new Date().toISOString(),
          }
        }
      )
    }
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
    }
  }
  
  private generateSignature(params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&')
    
    return crypto
      .createHash('sha256')
      .update(sortedParams + this.apiSecret)
      .digest('hex')
  }
  
  // Generate transformation URLs
  getTransformedUrl(
    publicId: string,
    transformation: string
  ): string {
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${transformation}/${publicId}`
  }
}
```

## Integration Best Practices

### Error Handling & Retries
```typescript
// Unified retry logic for all integrations
export class IntegrationRetryHandler {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number
      backoff?: 'exponential' | 'linear'
      initialDelay?: number
      maxDelay?: number
      onError?: (error: any, attempt: number) => void
    } = {}
  ): Promise<T> {
    const maxAttempts = options.maxAttempts || 3
    const backoff = options.backoff || 'exponential'
    const initialDelay = options.initialDelay || 1000
    const maxDelay = options.maxDelay || 30000
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        if (options.onError) {
          options.onError(error, attempt)
        }
        
        if (attempt === maxAttempts) {
          throw error
        }
        
        const delay = backoff === 'exponential'
          ? Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)
          : initialDelay * attempt
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw new Error('Max attempts exceeded')
  }
}

// Usage example
const retryHandler = new IntegrationRetryHandler()

const result = await retryHandler.executeWithRetry(
  async () => {
    return await stripe.paymentIntents.create(params)
  },
  {
    maxAttempts: 3,
    backoff: 'exponential',
    onError: (error, attempt) => {
      console.error(`Stripe error (attempt ${attempt}):`, error)
    }
  }
)
```

### Webhook Security
```typescript
// Unified webhook verification
export class WebhookVerifier {
  private verifiers = new Map<string, (body: string, signature: string) => boolean>()
  
  constructor(secrets: Record<string, string>) {
    // Register verifiers for each service
    this.verifiers.set('stripe', (body, signature) => {
      // Stripe verification logic
      return true
    })
    
    this.verifiers.set('clerk', (body, signature) => {
      // Clerk verification logic
      return true
    })
    
    // Add more verifiers as needed
  }
  
  verify(
    service: string,
    body: string,
    signature: string
  ): boolean {
    const verifier = this.verifiers.get(service)
    
    if (!verifier) {
      throw new Error(`Unknown service: ${service}`)
    }
    
    return verifier(body, signature)
  }
}
```

### Cost Optimization
```typescript
// Track integration usage to stay within free tiers
export class IntegrationUsageTracker {
  async track(
    service: string,
    operation: string,
    count: number = 1,
    env: Env
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0]
    const key = `usage:${service}:${today}`
    
    const current = await env.KV.get(key, 'json') || {}
    current[operation] = (current[operation] || 0) + count
    
    await env.KV.put(key, JSON.stringify(current), {
      expirationTtl: 86400 * 7 // Keep for 7 days
    })
    
    // Check limits
    await this.checkLimits(service, current, env)
  }
  
  private async checkLimits(
    service: string,
    usage: Record<string, number>,
    env: Env
  ): Promise<void> {
    const limits = {
      resend: { emails: 3000 },
      clerk: { activeUsers: 5000 },
      mixpanel: { events: 100000 },
      // Add more limits
    }
    
    const serviceLimits = limits[service]
    if (!serviceLimits) return
    
    for (const [operation, limit] of Object.entries(serviceLimits)) {
      if (usage[operation] > limit * 0.8) { // 80% threshold
        await this.sendLimitWarning(service, operation, usage[operation], limit, env)
      }
    }
  }
  
  private async sendLimitWarning(
    service: string,
    operation: string,
    usage: number,
    limit: number,
    env: Env
  ): Promise<void> {
    // Queue warning email
    await env.EMAIL_QUEUE.send({
      to: env.ADMIN_EMAIL,
      subject: `${service} usage warning`,
      template: 'limit_warning',
      data: {
        service,
        operation,
        usage,
        limit,
        percentage: Math.round((usage / limit) * 100)
      }
    })
  }
}
```

