# Workers AI: Edge AI Inference at Scale

## The 5-Minute Proof

> **The Pitch:** Workers AI gives you instant access to 40+ AI models including LLMs, image generation, and speech recognition with zero infrastructure setup.
>
> **The Win:** 
> ```typescript
> // Generate text with Llama 2 in one line
> const result = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
>   prompt: 'Explain quantum computing in simple terms',
>   max_tokens: 200
> })
> ```
>
> **The Catch:** 10,000 neurons/day (about 200-500 LLM requests) - enough for features and demos, but you'll need careful usage tracking for production apps.

---

> **TL;DR - Key Takeaways**
> - **What**: Run AI models at the edge without managing infrastructure
> - **Free Tier**: 10,000 neurons/day (inference units)
> - **Primary Use Cases**: Text generation, image creation, embeddings, speech-to-text
> - **Key Features**: 40+ models available, automatic scaling, global inference
> - **Limitations**: Request size limits vary by model, no fine-tuning on free tier

## Bringing Intelligence to the Edge

Run LLMs, generate images, and process speech—all without managing GPU infrastructure. Workers AI provides 40+ models accessible via simple API calls, with 10,000 inference units daily on the free tier.

```javascript
// AI infrastructure comparison
const aiComparison = {
  traditionalAI: {
    setup: "Provision GPU servers ($1000s/month)",
    latency: "100-500ms from distant regions", 
    scaling: "Manual, complex, expensive",
    models: "Self-hosted, self-managed"
  },
  
  workersAI: {
    setup: "Just call the API",
    latency: "Sub-100ms globally",
    scaling: "Automatic, unlimited",
    models: "30+ models ready to use"
  }
}
```

### Getting Started

```typescript
interface Env {
  AI: Ai
}

export default {
  async fetch(request: Request, env: Env) {
    // Text generation
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: 'Write a haiku about cloudflare',
      max_tokens: 100
    })
    
    return Response.json({
      haiku: response.response
    })
  }
}
```

### Available Models

Workers AI offers models across multiple categories:

```typescript
const availableModels = {
  // Text Generation
  llms: [
    '@cf/meta/llama-2-7b-chat-int8',      // General chat
    '@cf/mistral/mistral-7b-instruct-v0.1', // Instruction following
    '@cf/microsoft/phi-2',                  // Code generation
  ],
  
  // Text Classification & Embeddings
  understanding: [
    '@cf/baai/bge-base-en-v1.5',          // Text embeddings
    '@cf/huggingface/distilbert-sst-2-int8', // Sentiment
  ],
  
  // Image Generation
  imageGen: [
    '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    '@cf/lykon/dreamshaper-8-lcm',
  ],
  
  // Image Analysis
  vision: [
    '@cf/openai/clip-vit-base-patch32',   // Image embeddings
    '@cf/microsoft/resnet-50',             // Classification
  ],
  
  // Speech
  audio: [
    '@cf/openai/whisper',                  // Speech to text
  ],
  
  // Translation
  translation: [
    '@cf/meta/m2m100-1.2b',               // 100+ languages
  ]
}
```

### Real-World Applications

#### Intelligent Chatbot
```typescript
export class ChatBot {
  private conversationHistory: Map<string, Array<{
    role: string
    content: string
  }>> = new Map()
  
  constructor(
    private ai: Ai,
    private kv: KVNamespace
  ) {}
  
  async chat(
    sessionId: string,
    message: string,
    options: {
      model?: string
      temperature?: number
      maxTokens?: number
      systemPrompt?: string
    } = {}
  ): Promise<{
    response: string
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }> {
    // Get conversation history
    let history = await this.getHistory(sessionId)
    
    // Add user message
    history.push({ role: 'user', content: message })
    
    // Build prompt
    const prompt = this.buildPrompt(history, options.systemPrompt)
    
    // Generate response
    const startTime = Date.now()
    const response = await this.ai.run(
      options.model || '@cf/meta/llama-2-7b-chat-int8',
      {
        prompt,
        max_tokens: options.maxTokens || 500,
        temperature: options.temperature || 0.7,
        stream: false
      }
    )
    
    // Add assistant response to history
    history.push({ role: 'assistant', content: response.response })
    
    // Trim history if too long
    if (history.length > 20) {
      history = history.slice(-20)
    }
    
    // Save history
    await this.saveHistory(sessionId, history)
    
    // Calculate token usage (approximate)
    const usage = {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(response.response.length / 4),
      totalTokens: Math.ceil((prompt.length + response.response.length) / 4)
    }
    
    // Log metrics
    await this.logMetrics(sessionId, {
      model: options.model || '@cf/meta/llama-2-7b-chat-int8',
      latency: Date.now() - startTime,
      tokens: usage.totalTokens
    })
    
    return {
      response: response.response,
      usage
    }
  }
  
  private buildPrompt(
    history: Array<{ role: string; content: string }>,
    systemPrompt?: string
  ): string {
    const system = systemPrompt || 'You are a helpful AI assistant.'
    
    let prompt = `System: ${system}\n\n`
    
    for (const message of history) {
      prompt += `${message.role === 'user' ? 'Human' : 'Assistant'}: ${message.content}\n\n`
    }
    
    prompt += 'Assistant: '
    
    return prompt
  }
  
  private async getHistory(sessionId: string) {
    const cached = await this.kv.get(`chat:${sessionId}`, 'json')
    return cached || []
  }
  
  private async saveHistory(sessionId: string, history: any[]) {
    await this.kv.put(`chat:${sessionId}`, JSON.stringify(history), {
      expirationTtl: 3600 // 1 hour
    })
  }
  
  private async logMetrics(sessionId: string, metrics: any) {
    // Log to analytics or monitoring service
  }
}

// Worker implementation
export default {
  async fetch(request: Request, env: Env) {
    const chatbot = new ChatBot(env.AI, env.KV)
    
    if (request.method === 'POST' && request.url.includes('/chat')) {
      const { sessionId, message, options } = await request.json()
      
      const response = await chatbot.chat(sessionId, message, options)
      
      return Response.json(response)
    }
    
    return new Response('Chat API', { status: 200 })
  }
}
```

#### Content Moderation System
```typescript
export class ContentModerator {
  constructor(
    private ai: Ai,
    private db: D1Database
  ) {}
  
  async moderateContent(content: {
    id: string
    text?: string
    imageUrl?: string
    userId: string
  }): Promise<{
    approved: boolean
    reasons: string[]
    scores: Record<string, number>
    actions: string[]
  }> {
    const scores: Record<string, number> = {}
    const reasons: string[] = []
    const actions: string[] = []
    
    // Text moderation
    if (content.text) {
      const textResults = await this.moderateText(content.text)
      Object.assign(scores, textResults.scores)
      reasons.push(...textResults.reasons)
    }
    
    // Image moderation
    if (content.imageUrl) {
      const imageResults = await this.moderateImage(content.imageUrl)
      Object.assign(scores, imageResults.scores)
      reasons.push(...imageResults.reasons)
    }
    
    // Determine approval
    const approved = this.determineApproval(scores)
    
    // Determine actions
    if (!approved) {
      if (scores.toxicity > 0.9 || scores.nsfw > 0.9) {
        actions.push('ban_user')
      } else if (scores.toxicity > 0.7 || scores.nsfw > 0.7) {
        actions.push('warn_user')
      }
      actions.push('hide_content')
    }
    
    // Log moderation result
    await this.logModeration({
      contentId: content.id,
      userId: content.userId,
      approved,
      scores,
      reasons,
      actions,
      timestamp: Date.now()
    })
    
    return { approved, reasons, scores, actions }
  }
  
  private async moderateText(text: string): Promise<{
    scores: Record<string, number>
    reasons: string[]
  }> {
    const scores: Record<string, number> = {}
    const reasons: string[] = []
    
    // Sentiment analysis
    const sentiment = await this.ai.run(
      '@cf/huggingface/distilbert-sst-2-int8',
      { text }
    )
    
    scores.negativity = sentiment[0].score
    
    // Toxicity detection (using LLM)
    const toxicityPrompt = `Rate the toxicity of this text from 0 to 1, where 0 is not toxic and 1 is very toxic. Only respond with a number.
    
Text: ${text}

Rating:`
    
    const toxicityResponse = await this.ai.run(
      '@cf/meta/llama-2-7b-chat-int8',
      {
        prompt: toxicityPrompt,
        max_tokens: 10
      }
    )
    
    scores.toxicity = parseFloat(toxicityResponse.response) || 0
    
    if (scores.toxicity > 0.7) {
      reasons.push('High toxicity detected')
    }
    
    // Spam detection
    const spamKeywords = ['buy now', 'click here', 'limited offer', 'act now']
    const spamScore = spamKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    ).length / spamKeywords.length
    
    scores.spam = spamScore
    
    if (scores.spam > 0.5) {
      reasons.push('Spam content detected')
    }
    
    return { scores, reasons }
  }
  
  private async moderateImage(imageUrl: string): Promise<{
    scores: Record<string, number>
    reasons: string[]
  }> {
    const scores: Record<string, number> = {}
    const reasons: string[] = []
    
    // Fetch image
    const response = await fetch(imageUrl)
    const imageBlob = await response.blob()
    const imageArray = new Uint8Array(await imageBlob.arrayBuffer())
    
    // NSFW detection (using image classification)
    const classification = await this.ai.run(
      '@cf/microsoft/resnet-50',
      { image: Array.from(imageArray) }
    )
    
    // Check for NSFW categories
    const nsfwCategories = ['nude', 'adult', 'explicit']
    let nsfwScore = 0
    
    for (const result of classification) {
      if (nsfwCategories.some(cat => result.label.toLowerCase().includes(cat))) {
        nsfwScore = Math.max(nsfwScore, result.score)
      }
    }
    
    scores.nsfw = nsfwScore
    
    if (scores.nsfw > 0.7) {
      reasons.push('NSFW content detected')
    }
    
    return { scores, reasons }
  }
  
  private determineApproval(scores: Record<string, number>): boolean {
    return scores.toxicity < 0.7 && 
           scores.nsfw < 0.7 && 
           scores.spam < 0.7
  }
  
  private async logModeration(result: any) {
    await this.db.prepare(`
      INSERT INTO moderation_log 
      (content_id, user_id, approved, scores, reasons, actions, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      result.contentId,
      result.userId,
      result.approved ? 1 : 0,
      JSON.stringify(result.scores),
      JSON.stringify(result.reasons),
      JSON.stringify(result.actions),
      result.timestamp
    ).run()
  }
}
```

#### AI-Powered Image Generation
```typescript
export class ImageGenerator {
  constructor(
    private ai: Ai,
    private r2: R2Bucket,
    private kv: KVNamespace
  ) {}
  
  async generateImage(params: {
    prompt: string
    negativePrompt?: string
    style?: string
    width?: number
    height?: number
    userId: string
  }): Promise<{
    url: string
    id: string
    metadata: Record<string, any>
  }> {
    // Check rate limit
    const rateLimitKey = `image_gen:${params.userId}`
    const dailyCount = parseInt(await this.kv.get(rateLimitKey) || '0')
    
    if (dailyCount >= 50) { // 50 images per day per user
      throw new Error('Daily generation limit exceeded')
    }
    
    // Enhance prompt based on style
    const enhancedPrompt = this.enhancePrompt(params.prompt, params.style)
    
    // Generate image
    const response = await this.ai.run(
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      {
        prompt: enhancedPrompt,
        negative_prompt: params.negativePrompt,
        width: params.width || 1024,
        height: params.height || 1024,
        num_steps: 20
      }
    )
    
    // Save to R2
    const imageId = crypto.randomUUID()
    const key = `generated/${params.userId}/${imageId}.png`
    
    await this.r2.put(key, response.image, {
      httpMetadata: {
        contentType: 'image/png'
      },
      customMetadata: {
        prompt: params.prompt,
        style: params.style || 'default',
        userId: params.userId,
        generatedAt: new Date().toISOString()
      }
    })
    
    // Update rate limit
    await this.kv.put(rateLimitKey, (dailyCount + 1).toString(), {
      expirationTtl: 86400 // 24 hours
    })
    
    // Log generation
    await this.logGeneration({
      imageId,
      userId: params.userId,
      prompt: params.prompt,
      style: params.style,
      timestamp: Date.now()
    })
    
    return {
      url: `/images/${key}`,
      id: imageId,
      metadata: {
        prompt: params.prompt,
        style: params.style,
        dimensions: `${params.width || 1024}x${params.height || 1024}`
      }
    }
  }
  
  private enhancePrompt(prompt: string, style?: string): string {
    const styleEnhancements: Record<string, string> = {
      'photorealistic': 'photorealistic, high detail, professional photography',
      'anime': 'anime style, manga, cel-shaded',
      'oil-painting': 'oil painting, artistic, textured brushstrokes',
      'watercolor': 'watercolor painting, soft colors, artistic',
      'digital-art': 'digital art, concept art, highly detailed',
      'sketch': 'pencil sketch, hand-drawn, artistic'
    }
    
    const enhancement = styleEnhancements[style || 'default'] || ''
    
    return enhancement ? `${prompt}, ${enhancement}` : prompt
  }
  
  async generateVariations(
    originalImageId: string,
    count: number = 4
  ): Promise<Array<{
    url: string
    id: string
  }>> {
    // Get original metadata
    const originalKey = await this.findImageKey(originalImageId)
    const original = await this.r2.get(originalKey)
    
    if (!original) {
      throw new Error('Original image not found')
    }
    
    const metadata = original.customMetadata
    const variations = []
    
    // Generate variations with slight prompt modifications
    for (let i = 0; i < count; i++) {
      const variedPrompt = `${metadata.prompt}, variation ${i + 1}, slightly different`
      
      const result = await this.generateImage({
        prompt: variedPrompt,
        style: metadata.style,
        userId: metadata.userId
      })
      
      variations.push(result)
    }
    
    return variations
  }
  
  private async findImageKey(imageId: string): Promise<string> {
    // Implementation depends on your storage structure
    return `generated/${imageId}.png`
  }
  
  private async logGeneration(data: any) {
    // Log to analytics or database
  }
}
```

#### Document Intelligence
```typescript
export class DocumentIntelligence {
  constructor(
    private ai: Ai,
    private vectorize: VectorizeIndex
  ) {}
  
  async processDocument(document: {
    id: string
    content: string
    type: 'email' | 'report' | 'article' | 'contract'
  }): Promise<{
    summary: string
    keyPoints: string[]
    entities: Array<{ type: string; value: string }>
    sentiment: string
    category: string
    actionItems: string[]
  }> {
    // Generate summary
    const summaryPrompt = `Summarize this ${document.type} in 2-3 sentences:

${document.content}

Summary:`
    
    const summaryResponse = await this.ai.run(
      '@cf/meta/llama-2-7b-chat-int8',
      {
        prompt: summaryPrompt,
        max_tokens: 150
      }
    )
    
    // Extract key points
    const keyPointsPrompt = `List the 3-5 most important points from this ${document.type}:

${document.content}

Key points:`
    
    const keyPointsResponse = await this.ai.run(
      '@cf/meta/llama-2-7b-chat-int8',
      {
        prompt: keyPointsPrompt,
        max_tokens: 200
      }
    )
    
    // Extract entities (simplified - use NER model in production)
    const entities = this.extractEntities(document.content)
    
    // Analyze sentiment
    const sentiment = await this.analyzeSentiment(document.content)
    
    // Categorize document
    const category = await this.categorizeDocument(document)
    
    // Extract action items
    const actionItems = await this.extractActionItems(document)
    
    // Store embeddings for future search
    await this.storeEmbeddings(document)
    
    return {
      summary: summaryResponse.response,
      keyPoints: this.parseKeyPoints(keyPointsResponse.response),
      entities,
      sentiment,
      category,
      actionItems
    }
  }
  
  private extractEntities(content: string): Array<{ type: string; value: string }> {
    const entities = []
    
    // Email regex
    const emails = content.match(/[\w.-]+@[\w.-]+\.\w+/g) || []
    entities.push(...emails.map(email => ({ type: 'email', value: email })))
    
    // Phone regex (simplified)
    const phones = content.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || []
    entities.push(...phones.map(phone => ({ type: 'phone', value: phone })))
    
    // Date regex (simplified)
    const dates = content.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) || []
    entities.push(...dates.map(date => ({ type: 'date', value: date })))
    
    // Money amounts
    const amounts = content.match(/\$[\d,]+\.?\d*/g) || []
    entities.push(...amounts.map(amount => ({ type: 'money', value: amount })))
    
    return entities
  }
  
  private async analyzeSentiment(content: string): Promise<string> {
    const response = await this.ai.run(
      '@cf/huggingface/distilbert-sst-2-int8',
      { text: content.slice(0, 512) } // Model has token limit
    )
    
    const score = response[0].score
    
    if (score > 0.8) return 'positive'
    if (score > 0.6) return 'slightly positive'
    if (score > 0.4) return 'neutral'
    if (score > 0.2) return 'slightly negative'
    return 'negative'
  }
  
  private async categorizeDocument(document: any): Promise<string> {
    const categories = {
      email: ['personal', 'business', 'marketing', 'support'],
      report: ['financial', 'technical', 'research', 'status'],
      article: ['news', 'tutorial', 'opinion', 'review'],
      contract: ['employment', 'service', 'lease', 'purchase']
    }
    
    const availableCategories = categories[document.type] || ['general']
    
    const prompt = `Categorize this ${document.type} into one of these categories: ${availableCategories.join(', ')}

Content: ${document.content.slice(0, 1000)}

Category:`
    
    const response = await this.ai.run(
      '@cf/meta/llama-2-7b-chat-int8',
      {
        prompt,
        max_tokens: 20
      }
    )
    
    return response.response.trim().toLowerCase()
  }
  
  private async extractActionItems(document: any): Promise<string[]> {
    if (!['email', 'report'].includes(document.type)) {
      return []
    }
    
    const prompt = `Extract any action items or tasks from this ${document.type}:

${document.content}

Action items (list each on a new line):`
    
    const response = await this.ai.run(
      '@cf/meta/llama-2-7b-chat-int8',
      {
        prompt,
        max_tokens: 200
      }
    )
    
    return response.response
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^[-*]\s*/, ''))
  }
  
  private parseKeyPoints(response: string): string[] {
    return response
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+\.\s*/, ''))
      .slice(0, 5)
  }
  
  private async storeEmbeddings(document: any) {
    const embedding = await this.ai.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: [document.content.slice(0, 1000)] }
    )
    
    await this.vectorize.insert([{
      id: document.id,
      values: embedding.data[0],
      metadata: {
        type: document.type,
        summary: document.summary,
        timestamp: Date.now()
      }
    }])
  }
}
```

### Advanced AI Patterns

#### Streaming Responses
```typescript
export class StreamingAI {
  async streamCompletion(
    ai: Ai,
    prompt: string
  ): Promise<ReadableStream> {
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    
    // Start generation in background
    (async () => {
      try {
        const response = await ai.run(
          '@cf/meta/llama-2-7b-chat-int8',
          {
            prompt,
            stream: true,
            max_tokens: 500
          }
        )
        
        // Stream tokens as they arrive
        for await (const chunk of response) {
          const text = chunk.response || chunk.text || ''
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
        
        await writer.write(encoder.encode('data: [DONE]\n\n'))
      } catch (error) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
      } finally {
        await writer.close()
      }
    })()
    
    return readable
  }
}

// Usage in Worker
export default {
  async fetch(request: Request, env: Env) {
    if (request.url.includes('/stream')) {
      const { prompt } = await request.json()
      const streamer = new StreamingAI()
      
      const stream = await streamer.streamCompletion(env.AI, prompt)
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }
  }
}
```

#### Model Routing
```typescript
export class ModelRouter {
  private modelCapabilities = {
    '@cf/meta/llama-2-7b-chat-int8': {
      strengths: ['general', 'creative', 'conversation'],
      maxTokens: 2048,
      speed: 'fast'
    },
    '@cf/mistral/mistral-7b-instruct-v0.1': {
      strengths: ['instruction', 'technical', 'analysis'],
      maxTokens: 4096,
      speed: 'medium'
    },
    '@cf/microsoft/phi-2': {
      strengths: ['code', 'math', 'reasoning'],
      maxTokens: 2048,
      speed: 'very-fast'
    }
  }
  
  selectModel(task: {
    type: string
    complexity: 'low' | 'medium' | 'high'
    responseLength: number
  }): string {
    // Route based on task type
    if (task.type === 'code') {
      return '@cf/microsoft/phi-2'
    }
    
    if (task.type === 'creative' || task.type === 'conversation') {
      return '@cf/meta/llama-2-7b-chat-int8'
    }
    
    if (task.type === 'analysis' || task.complexity === 'high') {
      return '@cf/mistral/mistral-7b-instruct-v0.1'
    }
    
    // Default based on response length
    if (task.responseLength > 1000) {
      return '@cf/mistral/mistral-7b-instruct-v0.1'
    }
    
    return '@cf/meta/llama-2-7b-chat-int8'
  }
}
```

#### Cost Optimization
```typescript
export class AIOptimizer {
  constructor(
    private ai: Ai,
    private kv: KVNamespace
  ) {}
  
  async optimizedInference(params: {
    prompt: string
    maxTokens: number
    cacheKey?: string
    cacheTtl?: number
  }): Promise<string> {
    // Check cache first
    if (params.cacheKey) {
      const cached = await this.kv.get(params.cacheKey)
      if (cached) {
        return cached
      }
    }
    
    // Use smaller model for simple tasks
    const complexity = this.assessComplexity(params.prompt)
    const model = complexity === 'low' 
      ? '@cf/microsoft/phi-2'
      : '@cf/meta/llama-2-7b-chat-int8'
    
    // Optimize token usage
    const optimizedPrompt = this.optimizePrompt(params.prompt)
    
    // Run inference
    const response = await this.ai.run(model, {
      prompt: optimizedPrompt,
      max_tokens: Math.min(params.maxTokens, 500), // Cap tokens
      temperature: 0.7
    })
    
    // Cache result
    if (params.cacheKey) {
      await this.kv.put(
        params.cacheKey,
        response.response,
        { expirationTtl: params.cacheTtl || 3600 }
      )
    }
    
    return response.response
  }
  
  private assessComplexity(prompt: string): 'low' | 'high' {
    const wordCount = prompt.split(/\s+/).length
    const hasCode = /```|function|class|def|import/.test(prompt)
    const hasAnalysis = /analyze|explain|compare|evaluate/.test(prompt.toLowerCase())
    
    if (wordCount > 200 || hasCode || hasAnalysis) {
      return 'high'
    }
    
    return 'low'
  }
  
  private optimizePrompt(prompt: string): string {
    // Remove redundant whitespace
    let optimized = prompt.replace(/\s+/g, ' ').trim()
    
    // Remove unnecessary examples if prompt is long
    if (optimized.length > 1000) {
      optimized = optimized.replace(/For example:.*?(?=\n\n|\n[A-Z]|$)/gs, '')
    }
    
    return optimized
  }
}
```

### Performance Monitoring
```typescript
export class AIMonitor {
  constructor(
    private analytics: AnalyticsEngineDataset,
    private kv: KVNamespace
  ) {}
  
  async trackInference(params: {
    model: string
    promptLength: number
    responseLength: number
    latency: number
    userId: string
    success: boolean
  }) {
    // Log to analytics
    await this.analytics.writeDataPoint({
      dataset: 'ai_metrics',
      point: {
        model: params.model,
        promptTokens: Math.ceil(params.promptLength / 4),
        completionTokens: Math.ceil(params.responseLength / 4),
        latency: params.latency,
        userId: params.userId,
        success: params.success ? 1 : 0,
        timestamp: Date.now()
      }
    })
    
    // Update daily usage
    const dayKey = `usage:${new Date().toISOString().split('T')[0]}`
    const usage = await this.kv.get(dayKey, 'json') || {}
    
    usage[params.userId] = (usage[params.userId] || 0) + 1
    
    await this.kv.put(dayKey, JSON.stringify(usage), {
      expirationTtl: 86400 * 7 // Keep for 7 days
    })
  }
  
  async getUserUsage(userId: string): Promise<{
    daily: number
    weekly: number
    models: Record<string, number>
  }> {
    const today = new Date().toISOString().split('T')[0]
    const daily = await this.kv.get(`usage:${today}`, 'json') || {}
    
    // Calculate weekly
    let weekly = 0
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dayKey = `usage:${date.toISOString().split('T')[0]}`
      const dayUsage = await this.kv.get(dayKey, 'json') || {}
      weekly += dayUsage[userId] || 0
    }
    
    return {
      daily: daily[userId] || 0,
      weekly,
      models: {} // Would need separate tracking
    }
  }
}
```

### Workers AI Limits and Best Practices

```typescript
const workersAILimits = {
  freeNeurons: "10,000 per day",
  models: "30+ available models",
  requestSize: "100KB max input",
  responseSize: "Varies by model",
  concurrency: "50 simultaneous requests",
  timeout: "60 seconds per request"
}

const neuronCosts = {
  // Approximate neurons per operation
  textGeneration: {
    small: 5,      // < 100 tokens
    medium: 20,    // 100-500 tokens
    large: 50      // 500+ tokens
  },
  imageGeneration: {
    standard: 100, // 512x512
    hd: 500        // 1024x1024
  },
  embeddings: 1,
  classification: 1,
  speechToText: 30
}

const bestPractices = {
  caching: "Cache AI responses when possible",
  batching: "Batch similar requests together",
  modelSelection: "Choose appropriate model for task",
  promptEngineering: "Optimize prompts for clarity and brevity",
  errorHandling: "Implement fallbacks for quota limits",
  monitoring: "Track usage to stay within limits"
}
```

### Summary

Workers AI brings the power of large language models, image generation, and other AI capabilities directly to the edge. With 10,000 neurons daily on the free tier, it's enough to add intelligent features to any application without the complexity and cost of managing AI infrastructure. Workers AI enables chatbots, content moderation, image generation, document intelligence, and any feature that benefits from AI inference at the edge.

---

*Next: The Hono Framework - Building modern APIs on Workers*