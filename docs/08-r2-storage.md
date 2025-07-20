# R2 Storage: Object Storage Without Egress Fees

## The 5-Minute Proof

> **The Pitch:** R2 is S3-compatible object storage with the game-changing difference: zero egress fees. Store 10GB and serve unlimited downloads for free.
>
> **The Win:** 
> ```typescript
> // Upload once, serve millions of times for $0
> await env.BUCKET.put('images/logo.png', imageBuffer)
> const image = await env.BUCKET.get('images/logo.png')
> return new Response(image.body, {
>   headers: { 'Content-Type': 'image/png' }
> })
> ```
>
> **The Catch:** No public bucket access on free tier - you must serve files through Workers, which counts against your 100K daily requests.

---

> **TL;DR - Key Takeaways**
> - **What**: S3-compatible object storage with zero egress fees
> - **Free Tier**: 10GB storage, 1M Class A ops, 10M Class B ops/month
> - **Primary Use Cases**: File uploads, media storage, backups, static assets
> - **Key Features**: S3 API compatibility, zero egress fees, automatic replication
> - **Limitations**: No public buckets on free tier, 100MB upload limit per request

## The Game-Changing Storage Economics

R2's killer feature: zero egress fees. While S3 charges $0.09/GB for data transfer, R2 charges nothing. This single difference can reduce storage costs by 95% for content-heavy applications.

```javascript
// The hidden cost of cloud storage
const monthlyStorageCost = {
  // Storing 1TB of images
  s3: {
    storage: 1000 * 0.023,      // $23/month
    egress: 5000 * 0.09,        // $450/month (5TB transfer)
    total: 473                  // $473/month
  },
  
  r2: {
    storage: 1000 * 0.015,      // $15/month
    egress: 0,                  // $0 (unlimited)
    total: 15                   // $15/month
  }
}

// R2 is 31x cheaper for this use case!
```

### Getting Started with R2

Create a bucket:

```bash
# Create R2 bucket
wrangler r2 bucket create my-bucket

# Upload files
wrangler r2 object put my-bucket/hello.txt --file ./hello.txt
```

Basic operations in Workers:

```typescript
interface Env {
  BUCKET: R2Bucket
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const key = url.pathname.slice(1)
    
    switch (request.method) {
      case 'GET':
        const object = await env.BUCKET.get(key)
        
        if (!object) {
          return new Response('Object Not Found', { status: 404 })
        }
        
        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        
        return new Response(object.body, { headers })
      
      case 'PUT':
        await env.BUCKET.put(key, request.body, {
          httpMetadata: request.headers
        })
        return new Response('Created', { status: 201 })
      
      case 'DELETE':
        await env.BUCKET.delete(key)
        return new Response('Deleted', { status: 204 })
      
      default:
        return new Response('Method Not Allowed', { status: 405 })
    }
  }
}
```

### Real-World Patterns

#### Image Upload and Processing
```typescript
interface ImageUploadEnv extends Env {
  IMAGES: R2Bucket
  THUMBNAILS: R2Bucket
}

export class ImageService {
  constructor(private env: ImageUploadEnv) {}
  
  async upload(request: Request): Promise<Response> {
    const formData = await request.formData()
    const file = formData.get('image') as File
    
    if (!file) {
      return new Response('No image provided', { status: 400 })
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return new Response('Invalid file type', { status: 400 })
    }
    
    // Generate unique filename
    const ext = file.name.split('.').pop()
    const filename = `${crypto.randomUUID()}.${ext}`
    const key = `uploads/${new Date().toISOString().split('T')[0]}/${filename}`
    
    // Upload original
    await this.env.IMAGES.put(key, file, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size.toString()
      }
    })
    
    // Generate thumbnail in background
    const ctx = this.env.ctx as ExecutionContext
    ctx.waitUntil(this.generateThumbnail(key, file))
    
    return Response.json({
      key,
      url: `/images/${key}`,
      size: file.size,
      type: file.type
    })
  }
  
  private async generateThumbnail(key: string, file: File) {
    // Use Cloudflare Image Resizing API
    const response = await fetch(`/cdn-cgi/image/width=200/${key}`)
    const thumbnail = await response.blob()
    
    const thumbnailKey = key.replace('/uploads/', '/thumbnails/')
    await this.env.THUMBNAILS.put(thumbnailKey, thumbnail, {
      httpMetadata: {
        contentType: file.type,
      }
    })
  }
  
  async serve(key: string): Promise<Response> {
    const object = await this.env.IMAGES.get(key)
    
    if (!object) {
      return new Response('Not Found', { status: 404 })
    }
    
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    
    // Add caching headers
    headers.set('Cache-Control', 'public, max-age=31536000')
    headers.set('ETag', object.httpEtag)
    
    // Check if-none-match
    const ifNoneMatch = this.env.request.headers.get('If-None-Match')
    if (ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers })
    }
    
    return new Response(object.body, { headers })
  }
}

// Worker implementation
export default {
  async fetch(request: Request, env: ImageUploadEnv) {
    const url = new URL(request.url)
    const imageService = new ImageService(env)
    
    if (url.pathname === '/upload' && request.method === 'POST') {
      return imageService.upload(request)
    }
    
    if (url.pathname.startsWith('/images/')) {
      const key = url.pathname.slice('/images/'.length)
      return imageService.serve(key)
    }
    
    return new Response('Not Found', { status: 404 })
  }
}
```

#### Secure File Sharing
```typescript
export class SecureFileShare {
  constructor(
    private bucket: R2Bucket,
    private kv: KVNamespace
  ) {}
  
  async createShareLink(
    key: string,
    options: {
      expiresIn?: number
      maxDownloads?: number
      password?: string
    } = {}
  ): Promise<string> {
    const shareId = crypto.randomUUID()
    const shareData = {
      key,
      createdAt: Date.now(),
      expiresAt: Date.now() + (options.expiresIn || 86400000), // 24h default
      maxDownloads: options.maxDownloads || null,
      downloads: 0,
      password: options.password 
        ? await this.hashPassword(options.password)
        : null
    }
    
    await this.kv.put(
      `share:${shareId}`,
      JSON.stringify(shareData),
      {
        expirationTtl: Math.ceil((shareData.expiresAt - Date.now()) / 1000)
      }
    )
    
    return shareId
  }
  
  async accessShare(
    shareId: string,
    password?: string
  ): Promise<Response> {
    const shareData = await this.kv.get(`share:${shareId}`, 'json') as any
    
    if (!shareData) {
      return new Response('Share link not found', { status: 404 })
    }
    
    // Check expiration
    if (Date.now() > shareData.expiresAt) {
      await this.kv.delete(`share:${shareId}`)
      return new Response('Share link expired', { status: 410 })
    }
    
    // Check password
    if (shareData.password && !await this.verifyPassword(password || '', shareData.password)) {
      return new Response('Invalid password', { status: 401 })
    }
    
    // Check download limit
    if (shareData.maxDownloads && shareData.downloads >= shareData.maxDownloads) {
      return new Response('Download limit exceeded', { status: 410 })
    }
    
    // Get file from R2
    const object = await this.bucket.get(shareData.key)
    
    if (!object) {
      return new Response('File not found', { status: 404 })
    }
    
    // Update download count
    shareData.downloads++
    if (shareData.maxDownloads && shareData.downloads >= shareData.maxDownloads) {
      await this.kv.delete(`share:${shareId}`)
    } else {
      await this.kv.put(`share:${shareId}`, JSON.stringify(shareData))
    }
    
    // Return file
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('Content-Disposition', `attachment; filename="${shareData.key.split('/').pop()}"`)
    
    return new Response(object.body, { headers })
  }
  
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
  }
  
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    const passwordHash = await this.hashPassword(password)
    return passwordHash === hash
  }
}
```

#### Content Management System
```typescript
interface CMSFile {
  key: string
  name: string
  type: string
  size: number
  uploadedAt: string
  metadata: Record<string, string>
}

export class ContentManagementSystem {
  constructor(
    private bucket: R2Bucket,
    private db: D1Database
  ) {}
  
  async uploadFile(
    file: File,
    folder: string,
    metadata: Record<string, string> = {}
  ): Promise<CMSFile> {
    const key = `${folder}/${Date.now()}-${file.name}`
    
    // Upload to R2
    await this.bucket.put(key, file, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000'
      },
      customMetadata: metadata
    })
    
    // Store metadata in D1
    const cmsFile: CMSFile = {
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      metadata
    }
    
    await this.db.prepare(`
      INSERT INTO files (key, name, type, size, folder, metadata, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      key,
      file.name,
      file.type,
      file.size,
      folder,
      JSON.stringify(metadata),
      cmsFile.uploadedAt
    ).run()
    
    return cmsFile
  }
  
  async listFiles(
    folder: string,
    options: {
      limit?: number
      cursor?: string
      search?: string
    } = {}
  ): Promise<{
    files: CMSFile[]
    cursor?: string
  }> {
    let query = `
      SELECT * FROM files 
      WHERE folder = ?
    `
    const params: any[] = [folder]
    
    if (options.search) {
      query += ` AND name LIKE ?`
      params.push(`%${options.search}%`)
    }
    
    query += ` ORDER BY uploaded_at DESC LIMIT ?`
    params.push(options.limit || 50)
    
    if (options.cursor) {
      query += ` OFFSET ?`
      params.push(parseInt(options.cursor))
    }
    
    const result = await this.db.prepare(query)
      .bind(...params)
      .all()
    
    const files = result.results.map(row => ({
      key: row.key,
      name: row.name,
      type: row.type,
      size: row.size,
      uploadedAt: row.uploaded_at,
      metadata: JSON.parse(row.metadata)
    }))
    
    const nextCursor = files.length === (options.limit || 50)
      ? ((parseInt(options.cursor || '0')) + files.length).toString()
      : undefined
    
    return { files, cursor: nextCursor }
  }
  
  async deleteFile(key: string): Promise<void> {
    // Delete from R2
    await this.bucket.delete(key)
    
    // Delete from database
    await this.db.prepare('DELETE FROM files WHERE key = ?')
      .bind(key)
      .run()
  }
  
  async generateSignedUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    // For now, return a Worker URL
    // In production, use R2 presigned URLs when available
    return `/api/files/${encodeURIComponent(key)}`
  }
}
```

#### Backup and Archive System
```typescript
export class BackupService {
  constructor(
    private bucket: R2Bucket,
    private db: D1Database
  ) {}
  
  async createBackup(name: string): Promise<string> {
    const timestamp = new Date().toISOString()
    const backupKey = `backups/${name}-${timestamp}.tar.gz`
    
    // Export database
    const tables = ['users', 'posts', 'comments', 'files']
    const dbExport: Record<string, any[]> = {}
    
    for (const table of tables) {
      const data = await this.db.prepare(`SELECT * FROM ${table}`).all()
      dbExport[table] = data.results
    }
    
    // Create tar.gz archive
    const archive = await this.createArchive({
      'database.json': JSON.stringify(dbExport, null, 2),
      'metadata.json': JSON.stringify({
        name,
        timestamp,
        version: '1.0',
        tables: tables.length,
        totalRecords: Object.values(dbExport).reduce((sum, t) => sum + t.length, 0)
      }, null, 2)
    })
    
    // Upload to R2
    await this.bucket.put(backupKey, archive, {
      httpMetadata: {
        contentType: 'application/gzip',
        contentEncoding: 'gzip'
      },
      customMetadata: {
        name,
        timestamp,
        type: 'full-backup'
      }
    })
    
    // Record backup in database
    await this.db.prepare(`
      INSERT INTO backups (key, name, size, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(backupKey, name, archive.size, timestamp).run()
    
    return backupKey
  }
  
  async restoreBackup(backupKey: string): Promise<void> {
    // Get backup from R2
    const backup = await this.bucket.get(backupKey)
    if (!backup) {
      throw new Error('Backup not found')
    }
    
    // Extract archive
    const archive = await this.extractArchive(await backup.arrayBuffer())
    const dbExport = JSON.parse(archive['database.json'])
    
    // Restore database
    await this.db.transaction(async (tx) => {
      // Clear existing data
      for (const table of Object.keys(dbExport)) {
        await tx.prepare(`DELETE FROM ${table}`).run()
      }
      
      // Import data
      for (const [table, rows] of Object.entries(dbExport)) {
        for (const row of rows as any[]) {
          const columns = Object.keys(row)
          const placeholders = columns.map(() => '?').join(', ')
          
          await tx.prepare(`
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders})
          `).bind(...Object.values(row)).run()
        }
      }
    })
  }
  
  async listBackups(): Promise<Array<{
    key: string
    name: string
    size: number
    createdAt: string
  }>> {
    const result = await this.db.prepare(`
      SELECT * FROM backups
      ORDER BY created_at DESC
      LIMIT 100
    `).all()
    
    return result.results as any[]
  }
  
  private async createArchive(files: Record<string, string>): Promise<Blob> {
    // Simplified - in production use a proper tar library
    const boundary = '----CloudflareArchiveBoundary'
    const parts: string[] = []
    
    for (const [filename, content] of Object.entries(files)) {
      parts.push(`--${boundary}`)
      parts.push(`Content-Disposition: form-data; name="file"; filename="${filename}"`)
      parts.push('')
      parts.push(content)
    }
    
    parts.push(`--${boundary}--`)
    
    return new Blob([parts.join('\r\n')], { type: 'multipart/form-data' })
  }
  
  private async extractArchive(data: ArrayBuffer): Promise<Record<string, string>> {
    // Simplified - in production use a proper tar library
    const text = new TextDecoder().decode(data)
    const files: Record<string, string> = {}
    
    // Parse multipart data
    const parts = text.split('----CloudflareArchiveBoundary')
    
    for (const part of parts) {
      const match = part.match(/filename="([^"]+)"[\r\n]+(.+)/s)
      if (match) {
        files[match[1]] = match[2].trim()
      }
    }
    
    return files
  }
}
```

### Advanced R2 Features

#### Multipart Uploads
```typescript
export class LargeFileUploader {
  constructor(private bucket: R2Bucket) {}
  
  async uploadLargeFile(
    key: string,
    file: ReadableStream,
    size: number
  ): Promise<void> {
    const partSize = 10 * 1024 * 1024 // 10MB chunks
    const numParts = Math.ceil(size / partSize)
    
    // Initiate multipart upload
    const upload = await this.bucket.createMultipartUpload(key)
    
    try {
      const parts: R2UploadedPart[] = []
      const reader = file.getReader()
      
      for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        const chunk = await this.readChunk(reader, partSize)
        
        const part = await upload.uploadPart(partNumber, chunk)
        parts.push(part)
      }
      
      // Complete upload
      await upload.complete(parts)
    } catch (error) {
      // Abort on error
      await upload.abort()
      throw error
    }
  }
  
  private async readChunk(
    reader: ReadableStreamDefaultReader,
    size: number
  ): Promise<ArrayBuffer> {
    const chunks: Uint8Array[] = []
    let totalSize = 0
    
    while (totalSize < size) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      chunks.push(value)
      totalSize += value.length
    }
    
    // Combine chunks
    const result = new Uint8Array(totalSize)
    let offset = 0
    
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    
    return result.buffer
  }
}
```

#### Lifecycle Policies
```typescript
export class LifecycleManager {
  constructor(
    private bucket: R2Bucket,
    private kv: KVNamespace
  ) {}
  
  async applyLifecycleRules(): Promise<void> {
    // List old temporary files
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    
    const list = await this.bucket.list({
      prefix: 'temp/',
      limit: 1000
    })
    
    for (const object of list.objects) {
      if (object.uploaded.getTime() < thirtyDaysAgo) {
        await this.bucket.delete(object.key)
      }
    }
    
    // Archive old backups
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
    
    const backups = await this.bucket.list({
      prefix: 'backups/',
      limit: 1000
    })
    
    for (const backup of backups.objects) {
      if (backup.uploaded.getTime() < ninetyDaysAgo) {
        // Move to cold storage (simulated)
        const object = await this.bucket.get(backup.key)
        if (object) {
          await this.bucket.put(
            backup.key.replace('backups/', 'archive/'),
            object.body,
            {
              customMetadata: {
                archivedAt: new Date().toISOString(),
                originalKey: backup.key
              }
            }
          )
          await this.bucket.delete(backup.key)
        }
      }
    }
  }
}
```

### Performance Optimization

#### Edge Caching
```typescript
export class CachedStorage {
  constructor(
    private bucket: R2Bucket,
    private cache: KVNamespace
  ) {}
  
  async get(key: string): Promise<Response> {
    // Check KV cache first
    const cached = await this.cache.get(key, 'stream')
    
    if (cached) {
      return new Response(cached, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=3600'
        }
      })
    }
    
    // Fetch from R2
    const object = await this.bucket.get(key)
    
    if (!object) {
      return new Response('Not Found', { status: 404 })
    }
    
    // Cache small files in KV
    if (object.size < 1024 * 1024) { // 1MB
      const arrayBuffer = await object.arrayBuffer()
      await this.cache.put(key, arrayBuffer, {
        expirationTtl: 3600
      })
    }
    
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('X-Cache', 'MISS')
    
    return new Response(object.body, { headers })
  }
}
```

#### Conditional Requests
```typescript
export async function handleConditionalRequest(
  request: Request,
  bucket: R2Bucket,
  key: string
): Promise<Response> {
  const ifNoneMatch = request.headers.get('If-None-Match')
  const ifModifiedSince = request.headers.get('If-Modified-Since')
  
  const object = await bucket.get(key, {
    onlyIf: {
      etagDoesNotMatch: ifNoneMatch || undefined,
      uploadedAfter: ifModifiedSince 
        ? new Date(ifModifiedSince)
        : undefined
    }
  })
  
  if (!object) {
    return new Response(null, { 
      status: 304,
      headers: {
        'Cache-Control': 'public, max-age=31536000'
      }
    })
  }
  
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('ETag', object.httpEtag)
  headers.set('Last-Modified', object.uploaded.toUTCString())
  
  return new Response(object.body, { headers })
}
```

### Cost Optimization

#### Storage Tiering
```typescript
export class StorageTiering {
  constructor(
    private hotBucket: R2Bucket,    // Frequently accessed
    private coldBucket: R2Bucket,   // Archival
    private db: D1Database
  ) {}
  
  async moveToArchive(key: string): Promise<void> {
    // Get from hot storage
    const object = await this.hotBucket.get(key)
    if (!object) return
    
    // Copy to cold storage
    await this.coldBucket.put(key, object.body, {
      httpMetadata: object.httpMetadata,
      customMetadata: {
        ...object.customMetadata,
        archivedAt: new Date().toISOString(),
        originalBucket: 'hot'
      }
    })
    
    // Update database
    await this.db.prepare(`
      UPDATE files 
      SET storage_tier = 'cold', archived_at = ?
      WHERE key = ?
    `).bind(new Date().toISOString(), key).run()
    
    // Delete from hot storage
    await this.hotBucket.delete(key)
  }
  
  async retrieveFromArchive(key: string): Promise<void> {
    // Get from cold storage
    const object = await this.coldBucket.get(key)
    if (!object) return
    
    // Copy back to hot storage
    await this.hotBucket.put(key, object.body, {
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata
    })
    
    // Update database
    await this.db.prepare(`
      UPDATE files 
      SET storage_tier = 'hot', archived_at = NULL
      WHERE key = ?
    `).bind(key).run()
  }
}
```

### R2 Limits and Best Practices

```typescript
const r2Limits = {
  storage: "10GB free",
  operations: {
    classA: "1 million/month free", // PUT, POST, LIST
    classB: "10 million/month free" // GET, HEAD
  },
  objectSize: "5TB maximum",
  partSize: "5GB maximum",
  egress: "Unlimited free",
  buckets: "1000 per account"
}

const bestPractices = {
  naming: "Use prefixes for organization (images/, backups/)",
  caching: "Set appropriate Cache-Control headers",
  compression: "Compress text files before storage",
  metadata: "Use custom metadata for searchability",
  lifecycle: "Implement cleanup for temporary files"
}
```

### R2 vs Other Storage Solutions

```javascript
// Real-world cost comparison (1TB storage, 10TB egress/month)
const monthlyComparison = {
  s3: {
    storage: 23,
    egress: 900,  // $0.09/GB
    requests: 5,
    total: 928
  },
  cloudfront: {
    storage: 23,
    egress: 850,  // $0.085/GB  
    requests: 5,
    total: 878
  },
  r2: {
    storage: 15,
    egress: 0,    // Free!
    requests: 0,  // 10M free
    total: 15
  }
}

// R2 is 62x cheaper for this use case
```

### Summary

R2 fundamentally changes the economics of object storage by eliminating egress fees. This single innovation enables use cases that were previously cost-prohibitive: media streaming, software distribution, backup services, and content-heavy applications. The generous free tier (10GB storage, unlimited egress) makes R2 perfect for any application that stores and serves files, from user uploads to static assets.

---

*Next: Vectorize - AI-powered vector search at the edge*