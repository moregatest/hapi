/**
 * R2Manager - Cloudflare R2 file storage integration
 *
 * Handles file uploads, deletions, and URL generation for Cloudflare R2.
 * Uses AWS S3 SDK for S3-compatible API access.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { randomBytes } from 'node:crypto'
import type { R2Configuration } from '../configuration'

export interface UploadFileOptions {
    buffer: Buffer
    fileName: string
    contentType: string
    sessionId?: string
    projectPath?: string
}

export interface UploadFileResult {
    key: string
    publicUrl: string
    expiresAt: number
}

export class R2Manager {
    private readonly client: S3Client
    private readonly config: R2Configuration

    constructor(config: R2Configuration) {
        this.config = config

        // Initialize S3 client with R2 endpoint
        this.client = new S3Client({
            region: config.region,
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        })
    }

    /**
     * Ensure the R2 bucket exists
     */
    async ensureBucketExists(): Promise<void> {
        try {
            // Check if bucket exists
            await this.client.send(new HeadBucketCommand({
                Bucket: this.config.bucketName,
            }))
        } catch (error: any) {
            // Bucket doesn't exist
            if (error.name === 'NotFound' && this.config.autoCreateBucket) {
                console.log(`[R2] Creating bucket: ${this.config.bucketName}`)
                await this.client.send(new CreateBucketCommand({
                    Bucket: this.config.bucketName,
                }))
                console.log(`[R2] Bucket created: ${this.config.bucketName}`)

                // Note: Public access must be configured via Cloudflare dashboard or API
                // The Public Bucket feature is not available through S3 API
                if (this.config.cloudflareApiToken) {
                    console.log('[R2] To enable public access, use Cloudflare dashboard or API')
                }
            } else {
                throw error
            }
        }
    }

    /**
     * Upload a file to R2
     */
    async uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
        const { buffer, fileName, contentType, sessionId, projectPath } = options

        // Generate unique object key
        const key = this.buildObjectKey(fileName, sessionId, projectPath)

        // Calculate expiration time
        const expiresAt = new Date(Date.now() + this.config.fileExpirationHours * 60 * 60 * 1000)
        const expiresAtTimestamp = expiresAt.getTime()

        // Upload using multipart upload for large files
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: this.config.bucketName,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                // Set file expiration attributes
                Expires: expiresAt,  // HTTP expiration header (affects caching)
                CacheControl: `public, max-age=${this.config.fileExpirationHours * 3600}`,  // Cache control
                Metadata: {
                    'expires-at': expiresAtTimestamp.toString(),  // Custom metadata: expiration timestamp
                    'uploaded-at': Date.now().toString(),          // Upload timestamp
                },
            },
        })

        await upload.done()

        // Build public URL
        const publicUrl = this.buildPublicUrl(key)

        return { key, publicUrl, expiresAt: expiresAtTimestamp }
    }

    /**
     * Delete a file from R2
     */
    async deleteFile(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.config.bucketName,
            Key: key,
        }))
    }

    /**
     * Build a unique object key for the file
     * Format: sessions/{sessionId}/{fileId}/{fileName} or projects/{base64ProjectPath}/{fileId}/{fileName}
     */
    private buildObjectKey(fileName: string, sessionId?: string, projectPath?: string): string {
        // Generate unique file ID (timestamp + random)
        const fileId = `${Date.now()}-${randomBytes(8).toString('hex')}`

        // Sanitize filename
        const sanitizedFileName = this.sanitizeFileName(fileName)

        if (sessionId) {
            return `sessions/${sessionId}/${fileId}/${sanitizedFileName}`
        } else if (projectPath) {
            // Use base64url encoding for project path to avoid special characters
            const encodedPath = Buffer.from(projectPath).toString('base64url')
            return `projects/${encodedPath}/${fileId}/${sanitizedFileName}`
        } else {
            // Fallback to global namespace
            return `uploads/${fileId}/${sanitizedFileName}`
        }
    }

    /**
     * Build public URL for the object
     */
    private buildPublicUrl(key: string): string {
        // If publicDomain already includes protocol, use it as-is
        const domain = this.config.publicDomain.startsWith('http://') || this.config.publicDomain.startsWith('https://')
            ? this.config.publicDomain
            : `https://${this.config.publicDomain}`

        return `${domain}/${key}`
    }

    /**
     * Sanitize filename to remove special characters
     */
    private sanitizeFileName(fileName: string): string {
        // Replace special characters with underscores
        return fileName
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 255) // Limit filename length
    }
}
