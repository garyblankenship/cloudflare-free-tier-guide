# Cloudflare Pages: Your Zero-Cost Global CDN

## The 5-Minute Proof

> **The Pitch:** Cloudflare Pages hosts your static sites on a global CDN with truly unlimited bandwidth. While competitors charge $180/month for 1TB of traffic, Pages charges $0—forever.
>
> **The Win:** Deploy a site globally in under 60 seconds:
> ```bash
> # Create a simple site
> mkdir my-site && cd my-site
> echo '<h1>Hello from the edge!</h1>' > index.html
> 
> # Deploy to Cloudflare's global network
> npx wrangler pages deploy . --project-name=my-first-site
> 
> # Your site is now live at:
> # https://my-first-site.pages.dev
> # 👆 Zero config. Zero cost. Deployed to 300+ locations.
> ```
>
> **The Catch:** The 500 builds/month limit means you'll need to be thoughtful about CI/CD pipelines. Direct uploads (like above) don't count against this limit.

---

> **TL;DR - Key Takeaways**
> - **What**: Static hosting with unlimited bandwidth and global CDN
> - **Free Tier**: Unlimited sites, unlimited requests, unlimited bandwidth
> - **Primary Use Cases**: Static sites, SPAs, JAMstack apps, documentation
> - **Key Features**: Git integration, preview deployments, custom domains, edge functions
> - **Limitations**: 500 builds/month, 100MB per file, 25MB total per deployment

## The Foundation of Free

Cloudflare Pages isn't just static hosting—it's your gateway to the entire Cloudflare ecosystem. With truly unlimited bandwidth and global distribution included free, it's the perfect starting point for any project.

### What Makes Pages Special

Traditional static hosts nickel-and-dime you on bandwidth. Vercel gives you 100GB/month free, Netlify offers 100GB/month, AWS CloudFront... well, check your credit card. Cloudflare Pages? **Unlimited**. Not "unlimited with fair use policy"—actually unlimited.

```javascript
// Bandwidth cost comparison (per month)
const bandwidthCosts = {
  vercel: {
    included: "100GB",
    overage: "$0.15/GB",
    example1TB: (1000 - 100) * 0.15  // $135/month
  },
  
  netlify: {
    included: "100GB", 
    overage: "$0.20/GB",
    example1TB: (1000 - 100) * 0.20  // $180/month
  },
  
  aws: {
    included: "0GB",
    overage: "$0.085/GB", 
    example1TB: 1000 * 0.085          // $85/month
  },
  
  cloudflare: {
    included: "Unlimited",
    overage: "$0",
    example1TB: 0                     // $0/month
  }
}
```

### Getting Started

```bash
# Install Wrangler CLI
npm install -g wrangler

# Create a new Pages project
npm create cloudflare@latest my-app -- --framework=react

# Deploy instantly
npx wrangler pages deploy dist
```

Your site is now live at `https://my-app.pages.dev` and distributed to 300+ global locations.

### Beyond Static Files

Pages seamlessly integrates with Workers for dynamic functionality:

```typescript
// functions/api/hello.ts
export async function onRequest(context) {
  return new Response(JSON.stringify({ 
    message: "Hello from the edge!",
    location: context.cf.colo 
  }))
}
```

This function runs at the edge, no configuration needed. Access it at `/api/hello`.

### Advanced Pages Features

#### Custom Domains
```bash
# Add your domain
wrangler pages domain add example.com

# Automatic SSL, global anycast, DDoS protection included
```

#### Preview Deployments
Every git branch gets a unique URL:
- `main` → `my-app.pages.dev`
- `feature` → `feature.my-app.pages.dev`
- PR #123 → `123.my-app.pages.dev`

#### Build Configuration
```json
// wrangler.toml
{
  "build": {
    "command": "npm run build",
    "output": "dist"
  },
  "env": {
    "production": {
      "vars": {
        "API_URL": "https://api.example.com"
      }
    }
  }
}
```

### Pages + Workers Integration

The real magic happens when you combine Pages with Workers:

```typescript
// functions/api/[[catchall]].ts
import { Hono } from 'hono'

const app = new Hono()

app.get('/users', async (c) => {
  const users = await c.env.DB.prepare('SELECT * FROM users').all()
  return c.json(users)
})

export async function onRequest(context) {
  return app.fetch(context.request, context.env)
}
```

Now your static site has a full API backend, running at the edge.

### Real-World Patterns

#### SPA with API Backend
```
my-app/
├── dist/              # React/Vue/Svelte build
├── functions/         # Edge API routes
│   ├── api/
│   │   ├── auth.ts   # Authentication endpoints
│   │   ├── data.ts   # CRUD operations
│   │   └── [[catchall]].ts  # Hono router
└── wrangler.toml
```

#### Static Site with Dynamic Features
```typescript
// functions/contact.ts
export async function onRequestPost(context) {
  const formData = await context.request.formData()
  
  // Send email via Email routing
  await context.env.EMAIL.send({
    to: 'contact@example.com',
    from: 'noreply@example.com',
    subject: 'Contact Form',
    text: formData.get('message')
  })
  
  return Response.redirect('/thank-you')
}
```

#### Image Optimization
```typescript
// functions/images/[[path]].ts
export async function onRequest(context) {
  const url = new URL(context.request.url)
  const width = url.searchParams.get('w') || '800'
  
  // Fetch from R2
  const original = await context.env.IMAGES.get(context.params.path)
  
  // Transform with Cloudflare Images
  return fetch(`/cdn-cgi/image/width=${width}/${original.url}`)
}
```

### Performance Optimizations

#### Smart Caching
```typescript
// functions/_middleware.ts
export async function onRequest(context) {
  const response = await context.next()
  
  // Cache static API responses
  if (context.request.url.includes('/api/static/')) {
    response.headers.set('Cache-Control', 'public, max-age=3600')
  }
  
  return response
}
```

#### Asset Optimization
```javascript
// build config
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['lodash', 'axios']
        }
      }
    }
  }
}
```

### Monitoring and Analytics

Pages includes built-in analytics:

```typescript
// Track custom events
export async function onRequest(context) {
  // Log to Analytics Engine
  context.env.ANALYTICS.writeDataPoint({
    dataset: 'pages_metrics',
    point: {
      url: context.request.url,
      method: context.request.method,
      timestamp: Date.now()
    }
  })
  
  return context.next()
}
```

### Cost Analysis

Let's be concrete about the savings:

```javascript
// Medium-traffic site: 50GB/day bandwidth
const monthlyCosts = {
  aws: 50 * 30 * 0.085,        // $127.50/month
  vercel: (1500 - 100) * 0.15, // $210/month
  cloudflare: 0                // $0/month
}

// High-traffic site: 500GB/day
const highTrafficCosts = {
  aws: 500 * 30 * 0.085,       // $1,275/month
  vercel: (15000 - 100) * 0.15,// $2,235/month
  cloudflare: 0                // Still $0/month
}
```

### When to Use Pages

**Perfect for:**
- Marketing sites and landing pages
- Documentation sites
- SPAs with API backends
- Blogs and content sites
- E-commerce frontends
- Portfolio sites

**Consider alternatives when:**
- You need complex server-side rendering (use Workers)
- You require long-running processes (use Durable Objects)
- You need WebSocket servers (use Durable Objects)

### Pages Best Practices

1. **Optimize Assets**: Use modern formats (WebP, AVIF)
2. **Enable Compression**: Brotli compression is automatic
3. **Use HTTP/3**: Enabled by default for all sites
4. **Implement Caching**: Set proper cache headers
5. **Monitor Performance**: Use Web Analytics (also free)

### Advanced Techniques

#### Incremental Static Regeneration
```typescript
// functions/blog/[slug].ts
export async function onRequest(context) {
  const cache = caches.default
  const cacheKey = new Request(context.request.url)
  
  // Try cache first
  let response = await cache.match(cacheKey)
  
  if (!response) {
    // Generate page
    response = await generateBlogPost(context.params.slug)
    
    // Cache for 1 hour
    response.headers.set('Cache-Control', 'public, max-age=3600')
    context.waitUntil(cache.put(cacheKey, response.clone()))
  }
  
  return response
}
```

#### A/B Testing
```typescript
// functions/_middleware.ts
export async function onRequest(context) {
  const cookie = context.request.headers.get('Cookie')
  const variant = cookie?.includes('variant=B') ? 'B' : 'A'
  
  // Serve different content
  if (variant === 'B' && context.request.url.includes('index.html')) {
    return fetch('https://my-app.pages.dev/index-b.html')
  }
  
  return context.next()
}
```

### The Pages Ecosystem

Pages is your entry point to:
- **Workers**: Add API endpoints
- **KV**: Store user sessions
- **D1**: Add a database
- **R2**: Handle file uploads
- **Email**: Process contact forms
- **Analytics**: Track usage

### Summary

Cloudflare Pages redefines what free hosting means. It's not a limited trial or a loss leader—it's a production-ready platform that happens to cost nothing. With unlimited bandwidth, global distribution, and seamless integration, Pages provides everything needed for modern web hosting: CDN, SSL, DDoS protection, and global performance.

---

*Next: Workers - Adding serverless compute to your Pages site*