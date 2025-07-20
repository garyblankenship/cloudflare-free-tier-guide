# Vectorize: AI-Powered Vector Search at the Edge

## The 5-Minute Proof

> **The Pitch:** Vectorize enables semantic search that understands meaning - find "jogging sneakers" when users search for "running shoes" across 5M vectors for free.
>
> **The Win:** 
> ```typescript
> // Find semantically similar content, not just keyword matches
> const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
>   text: ["best laptop for coding"]
> })
> const results = await env.VECTORIZE.query(embedding.data[0], {
>   topK: 5
> })
> ```
>
> **The Catch:** 30,000 queries/month limit means ~1,000 searches/day - perfect for features and demos, but you'll need optimization for high-traffic search.

---

> **TL;DR - Key Takeaways**
> - **What**: Vector database for semantic search and AI applications
> - **Free Tier**: 5M vectors, 30,000 queries/month, 5 indexes
> - **Primary Use Cases**: Semantic search, recommendations, RAG, similarity matching
> - **Key Features**: Multiple distance metrics, metadata filtering, global distribution
> - **Limitations**: 1536 dimensions max, 10KB metadata per vector

## Semantic Search for the Modern Web

Vector search understands meaning, not just keywords. While traditional search would miss "jogging sneakers" when searching for "running shoes," Vectorize finds semantically similar content across 5 million vectors on the free tier.

```javascript
// Traditional search limitations
const keywordSearch = {
  query: "running shoes",
  matches: ["running shoes", "shoes for running"],
  misses: ["jogging sneakers", "marathon footwear", "athletic trainers"]
}

// Vector search understanding
const vectorSearch = {
  query: "running shoes",
  matches: [
    "jogging sneakers",        // Semantically similar
    "marathon footwear",        // Contextually related
    "athletic trainers",        // Conceptually connected
    "track and field shoes"     // Domain relevant
  ]
}
```

### Getting Started with Vectorize

Create an index:

```bash
# Create vector index
wrangler vectorize create my-index \
  --dimensions=768 \
  --metric=cosine
```

Basic operations:

```typescript
interface Env {
  VECTORIZE: VectorizeIndex
  AI: Ai
}

export default {
  async fetch(request: Request, env: Env) {
    // Generate embedding
    const text = "What is the best laptop for programming?"
    const embedResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    })
    const embedding = embedResponse.data[0]
    
    // Store vector with metadata
    await env.VECTORIZE.insert([
      {
        id: 'doc-1',
        values: embedding,
        metadata: {
          title: 'Best Programming Laptops 2024',
          category: 'technology',
          url: '/blog/best-laptops-2024'
        }
      }
    ])
    
    // Search similar vectors
    const results = await env.VECTORIZE.query(embedding, {
      topK: 5,
      filter: { category: 'technology' }
    })
    
    return Response.json({
      query: text,
      results: results.matches.map(match => ({
        score: match.score,
        ...match.metadata
      }))
    })
  }
}
```

### Real-World Applications

#### Semantic Document Search
```typescript
export class DocumentSearch {
  constructor(
    private vectorize: VectorizeIndex,
    private ai: Ai,
    private db: D1Database
  ) {}
  
  async indexDocument(doc: {
    id: string
    title: string
    content: string
    metadata?: Record<string, any>
  }): Promise<void> {
    // Split into chunks for better search
    const chunks = this.chunkText(doc.content, 500)
    const vectors: VectorizeVector[] = []
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      // Generate embedding
      const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [chunk.text]
      })
      
      vectors.push({
        id: `${doc.id}-chunk-${i}`,
        values: response.data[0],
        metadata: {
          docId: doc.id,
          title: doc.title,
          chunkIndex: i,
          text: chunk.text,
          startOffset: chunk.start,
          endOffset: chunk.end,
          ...doc.metadata
        }
      })
    }
    
    // Store vectors
    await this.vectorize.insert(vectors)
    
    // Store document in database
    await this.db.prepare(`
      INSERT INTO documents (id, title, content, metadata, indexed_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      doc.id,
      doc.title,
      doc.content,
      JSON.stringify(doc.metadata || {}),
      new Date().toISOString()
    ).run()
  }
  
  async search(
    query: string,
    options: {
      limit?: number
      filter?: Record<string, any>
      includeContent?: boolean
    } = {}
  ): Promise<Array<{
    docId: string
    title: string
    score: number
    excerpt: string
    metadata: any
  }>> {
    // Generate query embedding
    const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [query]
    })
    const queryEmbedding = response.data[0]
    
    // Search vectors
    const results = await this.vectorize.query(queryEmbedding, {
      topK: options.limit || 10,
      filter: options.filter
    })
    
    // Group by document and get best match per doc
    const docScores = new Map<string, any>()
    
    for (const match of results.matches) {
      const docId = match.metadata.docId
      
      if (!docScores.has(docId) || match.score > docScores.get(docId).score) {
        docScores.set(docId, {
          docId,
          title: match.metadata.title,
          score: match.score,
          excerpt: this.generateExcerpt(match.metadata.text, query),
          metadata: match.metadata
        })
      }
    }
    
    // Sort by score and return
    return Array.from(docScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10)
  }
  
  private chunkText(
    text: string,
    chunkSize: number
  ): Array<{ text: string; start: number; end: number }> {
    const chunks: Array<{ text: string; start: number; end: number }> = []
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    
    let currentChunk = ''
    let currentStart = 0
    let currentPos = 0
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          start: currentStart,
          end: currentPos
        })
        currentChunk = sentence
        currentStart = currentPos
      } else {
        currentChunk += ' ' + sentence
      }
      currentPos += sentence.length
    }
    
    if (currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        start: currentStart,
        end: currentPos
      })
    }
    
    return chunks
  }
  
  private generateExcerpt(text: string, query: string): string {
    const queryWords = query.toLowerCase().split(/\s+/)
    const sentences = text.split(/[.!?]+/)
    
    // Find sentence with most query words
    let bestSentence = sentences[0]
    let maxMatches = 0
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase()
      const matches = queryWords.filter(word => sentenceLower.includes(word)).length
      
      if (matches > maxMatches) {
        maxMatches = matches
        bestSentence = sentence
      }
    }
    
    // Trim to reasonable length
    return bestSentence.trim().slice(0, 200) + '...'
  }
}
```

#### Product Recommendation Engine
```typescript
export class RecommendationEngine {
  constructor(
    private vectorize: VectorizeIndex,
    private ai: Ai,
    private kv: KVNamespace
  ) {}
  
  async indexProduct(product: {
    id: string
    name: string
    description: string
    category: string
    price: number
    attributes: Record<string, any>
  }): Promise<void> {
    // Create rich text representation
    const textRepresentation = `
      ${product.name}
      ${product.description}
      Category: ${product.category}
      ${Object.entries(product.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' ')}
    `.trim()
    
    // Generate embedding
    const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [textRepresentation]
    })
    
    // Store in Vectorize
    await this.vectorize.insert([{
      id: product.id,
      values: response.data[0],
      metadata: {
        name: product.name,
        category: product.category,
        price: product.price,
        ...product.attributes
      }
    }])
  }
  
  async getSimilarProducts(
    productId: string,
    options: {
      limit?: number
      priceRange?: { min: number; max: number }
      category?: string
    } = {}
  ): Promise<Array<{
    id: string
    name: string
    score: number
    price: number
  }>> {
    // Get product vector
    const product = await this.vectorize.getByIds([productId])
    
    if (!product || product.length === 0) {
      throw new Error('Product not found')
    }
    
    // Build filter
    const filter: Record<string, any> = {}
    
    if (options.priceRange) {
      filter.price = {
        $gte: options.priceRange.min,
        $lte: options.priceRange.max
      }
    }
    
    if (options.category) {
      filter.category = options.category
    }
    
    // Find similar products
    const results = await this.vectorize.query(product[0].values, {
      topK: (options.limit || 10) + 1, // +1 to exclude self
      filter
    })
    
    // Filter out the queried product and return
    return results.matches
      .filter(match => match.id !== productId)
      .map(match => ({
        id: match.id,
        name: match.metadata.name,
        score: match.score,
        price: match.metadata.price
      }))
      .slice(0, options.limit || 10)
  }
  
  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<Array<any>> {
    // Get user interaction history
    const history = await this.getUserHistory(userId)
    
    if (history.length === 0) {
      // Return popular products for new users
      return this.getPopularProducts(limit)
    }
    
    // Calculate user preference vector
    const userVector = await this.calculateUserPreferenceVector(history)
    
    // Find products matching user preferences
    const results = await this.vectorize.query(userVector, {
      topK: limit * 2, // Get extra to filter
      filter: {
        id: { $nin: history.map(h => h.productId) } // Exclude already seen
      }
    })
    
    // Re-rank based on multiple factors
    const reranked = await this.rerankResults(results.matches, userId)
    
    return reranked.slice(0, limit)
  }
  
  private async calculateUserPreferenceVector(
    history: Array<{ productId: string; interaction: string; timestamp: number }>
  ): Promise<number[]> {
    // Get vectors for interacted products
    const productIds = history.map(h => h.productId)
    const products = await this.vectorize.getByIds(productIds)
    
    // Weight by interaction type and recency
    const weights = history.map(h => {
      const recencyWeight = Math.exp(-(Date.now() - h.timestamp) / (30 * 24 * 60 * 60 * 1000))
      const interactionWeight = {
        view: 0.1,
        click: 0.3,
        purchase: 1.0,
        review: 0.8
      }[h.interaction] || 0.1
      
      return recencyWeight * interactionWeight
    })
    
    // Calculate weighted average
    const dimensions = products[0].values.length
    const avgVector = new Array(dimensions).fill(0)
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      const weight = weights[i]
      
      for (let d = 0; d < dimensions; d++) {
        avgVector[d] += product.values[d] * weight
      }
    }
    
    // Normalize
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    return avgVector.map(v => v / totalWeight)
  }
  
  private async getUserHistory(userId: string) {
    const cached = await this.kv.get(`user_history:${userId}`, 'json')
    return cached || []
  }
  
  private async getPopularProducts(limit: number) {
    // Implementation depends on your tracking
    return []
  }
  
  private async rerankResults(matches: any[], userId: string) {
    // Rerank based on business logic
    return matches
  }
}
```

#### Multi-Modal Search (Text + Image)
```typescript
export class MultiModalSearch {
  constructor(
    private textIndex: VectorizeIndex,
    private imageIndex: VectorizeIndex,
    private ai: Ai
  ) {}
  
  async indexContent(content: {
    id: string
    text?: string
    imageUrl?: string
    metadata: Record<string, any>
  }): Promise<void> {
    const vectors: Array<{
      index: VectorizeIndex
      data: VectorizeVector
    }> = []
    
    // Process text if available
    if (content.text) {
      const textResponse = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [content.text]
      })
      
      vectors.push({
        index: this.textIndex,
        data: {
          id: `${content.id}-text`,
          values: textResponse.data[0],
          metadata: {
            contentId: content.id,
            type: 'text',
            ...content.metadata
          }
        }
      })
    }
    
    // Process image if available
    if (content.imageUrl) {
      const imageResponse = await fetch(content.imageUrl)
      const imageBlob = await imageResponse.blob()
      
      const imageEmbedding = await this.ai.run('@cf/openai/clip-vit-base-patch32', {
        image: Array.from(new Uint8Array(await imageBlob.arrayBuffer()))
      })
      
      vectors.push({
        index: this.imageIndex,
        data: {
          id: `${content.id}-image`,
          values: imageEmbedding.data[0],
          metadata: {
            contentId: content.id,
            type: 'image',
            imageUrl: content.imageUrl,
            ...content.metadata
          }
        }
      })
    }
    
    // Insert all vectors
    await Promise.all(
      vectors.map(({ index, data }) => index.insert([data]))
    )
  }
  
  async search(query: {
    text?: string
    imageUrl?: string
    weights?: { text: number; image: number }
  }): Promise<Array<{
    id: string
    score: number
    type: string
    metadata: any
  }>> {
    const weights = query.weights || { text: 0.5, image: 0.5 }
    const results: Array<any> = []
    
    // Text search
    if (query.text) {
      const textEmbedding = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [query.text]
      })
      
      const textResults = await this.textIndex.query(textEmbedding.data[0], {
        topK: 20
      })
      
      results.push(...textResults.matches.map(match => ({
        ...match,
        score: match.score * weights.text,
        searchType: 'text'
      })))
    }
    
    // Image search
    if (query.imageUrl) {
      const imageResponse = await fetch(query.imageUrl)
      const imageBlob = await imageResponse.blob()
      
      const imageEmbedding = await this.ai.run('@cf/openai/clip-vit-base-patch32', {
        image: Array.from(new Uint8Array(await imageBlob.arrayBuffer()))
      })
      
      const imageResults = await this.imageIndex.query(imageEmbedding.data[0], {
        topK: 20
      })
      
      results.push(...imageResults.matches.map(match => ({
        ...match,
        score: match.score * weights.image,
        searchType: 'image'
      })))
    }
    
    // Combine and deduplicate results
    const combined = new Map<string, any>()
    
    for (const result of results) {
      const contentId = result.metadata.contentId
      
      if (!combined.has(contentId) || result.score > combined.get(contentId).score) {
        combined.set(contentId, {
          id: contentId,
          score: result.score,
          type: result.searchType,
          metadata: result.metadata
        })
      }
    }
    
    // Sort by combined score
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }
}
```

#### Question Answering System
```typescript
export class QuestionAnsweringSystem {
  constructor(
    private vectorize: VectorizeIndex,
    private ai: Ai,
    private kv: KVNamespace
  ) {}
  
  async answerQuestion(question: string): Promise<{
    answer: string
    sources: Array<{ title: string; url: string; relevance: number }>
    confidence: number
  }> {
    // Check cache first
    const cacheKey = `qa:${await this.hashQuestion(question)}`
    const cached = await this.kv.get(cacheKey, 'json')
    
    if (cached) {
      return cached
    }
    
    // Generate question embedding
    const questionEmbedding = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [question]
    })
    
    // Find relevant documents
    const searchResults = await this.vectorize.query(questionEmbedding.data[0], {
      topK: 5,
      filter: { type: 'faq' }
    })
    
    // Extract context from top matches
    const context = searchResults.matches
      .map(match => match.metadata.text)
      .join('\n\n')
    
    // Generate answer using LLM
    const answerResponse = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `Based on the following context, answer the question concisely and accurately.
      
Context:
${context}

Question: ${question}

Answer:`,
      max_tokens: 150
    })
    
    // Calculate confidence based on vector similarity scores
    const avgScore = searchResults.matches.reduce((sum, m) => sum + m.score, 0) / searchResults.matches.length
    const confidence = Math.min(avgScore * 100, 95)
    
    const result = {
      answer: answerResponse.response,
      sources: searchResults.matches.map(match => ({
        title: match.metadata.title,
        url: match.metadata.url,
        relevance: match.score
      })),
      confidence
    }
    
    // Cache the result
    await this.kv.put(cacheKey, JSON.stringify(result), {
      expirationTtl: 3600 // 1 hour
    })
    
    return result
  }
  
  async indexFAQ(faq: {
    question: string
    answer: string
    category: string
    url: string
  }): Promise<void> {
    // Combine question and answer for richer embedding
    const text = `Question: ${faq.question}\nAnswer: ${faq.answer}`
    
    const embedding = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    })
    
    await this.vectorize.insert([{
      id: crypto.randomUUID(),
      values: embedding.data[0],
      metadata: {
        type: 'faq',
        title: faq.question,
        text: faq.answer,
        category: faq.category,
        url: faq.url
      }
    }])
  }
  
  private async hashQuestion(question: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(question.toLowerCase().trim())
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
  }
}
```

### Advanced Vectorize Features

#### Hybrid Search (Vector + Keyword)
```typescript
export class HybridSearch {
  constructor(
    private vectorize: VectorizeIndex,
    private db: D1Database,
    private ai: Ai
  ) {}
  
  async search(
    query: string,
    options: {
      vectorWeight?: number
      keywordWeight?: number
      limit?: number
    } = {}
  ): Promise<Array<{
    id: string
    score: number
    title: string
    excerpt: string
  }>> {
    const vectorWeight = options.vectorWeight || 0.7
    const keywordWeight = options.keywordWeight || 0.3
    
    // Parallel searches
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, options.limit || 20),
      this.keywordSearch(query, options.limit || 20)
    ])
    
    // Combine scores
    const combined = new Map<string, any>()
    
    // Add vector results
    for (const result of vectorResults) {
      combined.set(result.id, {
        ...result,
        vectorScore: result.score * vectorWeight,
        keywordScore: 0,
        finalScore: result.score * vectorWeight
      })
    }
    
    // Add keyword results
    for (const result of keywordResults) {
      if (combined.has(result.id)) {
        const existing = combined.get(result.id)
        existing.keywordScore = result.score * keywordWeight
        existing.finalScore = existing.vectorScore + existing.keywordScore
      } else {
        combined.set(result.id, {
          ...result,
          vectorScore: 0,
          keywordScore: result.score * keywordWeight,
          finalScore: result.score * keywordWeight
        })
      }
    }
    
    // Sort by combined score
    return Array.from(combined.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, options.limit || 10)
  }
  
  private async vectorSearch(query: string, limit: number) {
    const embedding = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [query]
    })
    
    const results = await this.vectorize.query(embedding.data[0], {
      topK: limit
    })
    
    return results.matches.map(match => ({
      id: match.id,
      score: match.score,
      title: match.metadata.title,
      excerpt: match.metadata.excerpt
    }))
  }
  
  private async keywordSearch(query: string, limit: number) {
    const results = await this.db.prepare(`
      SELECT id, title, excerpt,
        (
          (CASE WHEN title LIKE ? THEN 10 ELSE 0 END) +
          (CASE WHEN excerpt LIKE ? THEN 5 ELSE 0 END) +
          (LENGTH(title) - LENGTH(REPLACE(LOWER(title), LOWER(?), ''))) +
          (LENGTH(excerpt) - LENGTH(REPLACE(LOWER(excerpt), LOWER(?), '')))
        ) as score
      FROM documents
      WHERE title LIKE ? OR excerpt LIKE ?
      ORDER BY score DESC
      LIMIT ?
    `).bind(
      `%${query}%`, `%${query}%`,
      query, query,
      `%${query}%`, `%${query}%`,
      limit
    ).all()
    
    return results.results.map(row => ({
      id: row.id,
      score: row.score / 100, // Normalize
      title: row.title,
      excerpt: row.excerpt
    }))
  }
}
```

#### Time-Aware Vector Search
```typescript
export class TimeAwareVectorSearch {
  constructor(private vectorize: VectorizeIndex, private ai: Ai) {}
  
  async search(
    query: string,
    options: {
      timeDecay?: number
      halfLife?: number
      limit?: number
    } = {}
  ): Promise<Array<any>> {
    const embedding = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [query]
    })
    
    const results = await this.vectorize.query(embedding.data[0], {
      topK: (options.limit || 10) * 3 // Get extra for re-ranking
    })
    
    const now = Date.now()
    const halfLife = options.halfLife || 30 * 24 * 60 * 60 * 1000 // 30 days
    const timeDecay = options.timeDecay || 0.3
    
    // Re-rank with time decay
    const reranked = results.matches.map(match => {
      const age = now - new Date(match.metadata.publishedAt).getTime()
      const decayFactor = Math.exp(-age / halfLife)
      
      return {
        ...match,
        originalScore: match.score,
        timeBoost: decayFactor * timeDecay,
        finalScore: match.score * (1 - timeDecay) + decayFactor * timeDecay
      }
    })
    
    return reranked
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, options.limit || 10)
  }
}
```

### Performance Optimization

#### Batch Processing
```typescript
export class BatchVectorProcessor {
  private queue: Array<{
    text: string
    resolve: (embedding: number[]) => void
    reject: (error: any) => void
  }> = []
  
  constructor(
    private ai: Ai,
    private batchSize: number = 10,
    private delayMs: number = 100
  ) {
    this.processBatch()
  }
  
  async getEmbedding(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, resolve, reject })
    })
  }
  
  private async processBatch() {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs))
      
      if (this.queue.length === 0) continue
      
      const batch = this.queue.splice(0, this.batchSize)
      
      try {
        const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
          text: batch.map(item => item.text)
        })
        
        batch.forEach((item, index) => {
          item.resolve(response.data[index])
        })
      } catch (error) {
        batch.forEach(item => item.reject(error))
      }
    }
  }
}
```

#### Dimension Reduction
```typescript
export class DimensionReducer {
  async reduceDimensions(
    vectors: number[][],
    targetDimensions: number
  ): Promise<number[][]> {
    // Simple PCA-like reduction
    const means = this.calculateMeans(vectors)
    const centered = vectors.map(v => 
      v.map((val, i) => val - means[i])
    )
    
    // Calculate covariance matrix (simplified)
    const covariance = this.calculateCovariance(centered)
    
    // Get top eigenvectors (simplified - use proper library in production)
    const topComponents = this.getTopComponents(covariance, targetDimensions)
    
    // Project vectors
    return centered.map(vector => 
      this.projectVector(vector, topComponents)
    )
  }
  
  private calculateMeans(vectors: number[][]): number[] {
    const dims = vectors[0].length
    const means = new Array(dims).fill(0)
    
    for (const vector of vectors) {
      for (let i = 0; i < dims; i++) {
        means[i] += vector[i]
      }
    }
    
    return means.map(sum => sum / vectors.length)
  }
  
  private calculateCovariance(vectors: number[][]): number[][] {
    // Simplified - implement proper covariance calculation
    return []
  }
  
  private getTopComponents(covariance: number[][], k: number): number[][] {
    // Simplified - implement proper eigenvalue decomposition
    return []
  }
  
  private projectVector(vector: number[], components: number[][]): number[] {
    return components.map(component => 
      vector.reduce((sum, val, i) => sum + val * component[i], 0)
    )
  }
}
```

### Vectorize Limits and Best Practices

```typescript
const vectorizeLimits = {
  vectors: "5 million on free tier",
  dimensions: "1536 maximum",
  queries: "30,000/month free",
  indexSize: "50GB maximum",
  metadataSize: "10KB per vector",
  batchInsert: "1000 vectors per request"
}

const bestPractices = {
  chunking: "Split large documents into smaller chunks",
  metadata: "Store searchable attributes in metadata",
  filtering: "Use metadata filters to narrow search space",
  normalization: "Normalize vectors for cosine similarity",
  caching: "Cache frequently searched queries",
  monitoring: "Track query performance and optimize"
}
```

### Summary

Vectorize transforms how we build search and recommendation features by understanding semantic meaning rather than just matching keywords. With 5 million vectors and 30,000 queries monthly on the free tier, it enables sophisticated AI-powered features that would typically require expensive infrastructure. Vectorize is essential for semantic search, recommendation engines, question-answering systems, and any application that benefits from understanding content similarity.

---

*Next: Workers AI - LLMs and image generation at the edge*