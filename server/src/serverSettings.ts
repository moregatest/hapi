/**
 * Server Settings Management
 *
 * Handles loading and persistence of server configuration.
 * Priority: environment variable > settings.json > default value
 *
 * When a value is loaded from environment variable and not present in settings.json,
 * it will be saved to settings.json for future use.
 */

import { join } from 'node:path'
import { readSettings, writeSettings, type Settings } from './web/cliApiToken'

export interface ServerSettings {
    telegramBotToken: string | null
    allowedChatIds: number[]
    webappPort: number
    webappUrl: string
    corsOrigins: string[]
    r2AccountId: string | null
    r2AccessKeyId: string | null
    r2SecretAccessKey: string | null
    r2BucketName: string | null
    r2PublicDomain: string | null
    r2Region: string
    r2AutoCreateBucket: boolean
    r2FileExpirationHours: number
    cloudflareApiToken: string | null
    allowedFileTypes: string[]
    maxFileSizeBytes: number
}

export interface ServerSettingsResult {
    settings: ServerSettings
    sources: {
        telegramBotToken: 'env' | 'file' | 'default'
        allowedChatIds: 'env' | 'file' | 'default'
        webappPort: 'env' | 'file' | 'default'
        webappUrl: 'env' | 'file' | 'default'
        corsOrigins: 'env' | 'file' | 'default'
        r2AccountId: 'env' | 'file' | 'default'
        r2AccessKeyId: 'env' | 'file' | 'default'
        r2SecretAccessKey: 'env' | 'file' | 'default'
        r2BucketName: 'env' | 'file' | 'default'
        r2PublicDomain: 'env' | 'file' | 'default'
        r2Region: 'env' | 'file' | 'default'
        r2AutoCreateBucket: 'env' | 'file' | 'default'
        r2FileExpirationHours: 'env' | 'file' | 'default'
        cloudflareApiToken: 'env' | 'file' | 'default'
        allowedFileTypes: 'env' | 'file' | 'default'
        maxFileSizeBytes: 'env' | 'file' | 'default'
    }
    savedToFile: boolean
}

/**
 * Parse comma-separated chat IDs from string
 */
function parseChatIds(str: string): number[] {
    return str
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id))
}

/**
 * Parse and normalize CORS origins
 */
function parseCorsOrigins(str: string): string[] {
    const entries = str
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)

    if (entries.includes('*')) {
        return ['*']
    }

    const normalized: string[] = []
    for (const entry of entries) {
        try {
            normalized.push(new URL(entry).origin)
        } catch {
            // Keep raw value if it's already an origin-like string
            normalized.push(entry)
        }
    }
    return normalized
}

/**
 * Derive CORS origins from webapp URL
 */
function deriveCorsOrigins(webappUrl: string): string[] {
    try {
        return [new URL(webappUrl).origin]
    } catch {
        return []
    }
}

/**
 * Parse and validate comma-separated MIME types
 * Format: type/subtype (e.g., "image/jpeg")
 */
function parseAllowedFileTypes(str: string): string[] {
    const types = str
        .split(',')
        .map(type => type.trim())
        .filter(Boolean)
        .filter(type => {
            if (!type.includes('/')) {
                console.warn(`[Server] Invalid MIME type format: ${type} (skipped)`)
                return false
            }
            return true
        })

    if (types.length === 0) {
        console.warn('[Server] No valid MIME types after parsing, using defaults')
        return []
    }

    return types
}

/**
 * Parse and validate max file size in MB
 * Returns size in bytes
 */
function parseMaxFileSize(str: string): number {
    const mb = parseInt(str, 10)

    if (!Number.isFinite(mb) || mb <= 0) {
        console.warn('[Server] Invalid HAPI_MAX_FILE_SIZE_MB, must be positive integer')
        return 0
    }

    if (mb > 1000) {
        console.warn('[Server] HAPI_MAX_FILE_SIZE_MB exceeds 1000MB, using 1000MB')
        return 1000 * 1024 * 1024
    }

    return mb * 1024 * 1024
}

/**
 * Load server settings with priority: env > file > default
 * Saves new env values to file when not already present
 */
export async function loadServerSettings(dataDir: string): Promise<ServerSettingsResult> {
    const settingsFile = join(dataDir, 'settings.json')
    const settings = await readSettings(settingsFile)

    // If settings file exists but couldn't be parsed, fail fast
    if (settings === null) {
        throw new Error(
            `Cannot read ${settingsFile}. Please fix or remove the file and restart.`
        )
    }

    let needsSave = false
    const sources: ServerSettingsResult['sources'] = {
        telegramBotToken: 'default',
        allowedChatIds: 'default',
        webappPort: 'default',
        webappUrl: 'default',
        corsOrigins: 'default',
        r2AccountId: 'default',
        r2AccessKeyId: 'default',
        r2SecretAccessKey: 'default',
        r2BucketName: 'default',
        r2PublicDomain: 'default',
        r2Region: 'default',
        r2AutoCreateBucket: 'default',
        r2FileExpirationHours: 'default',
        cloudflareApiToken: 'default',
        allowedFileTypes: 'default',
        maxFileSizeBytes: 'default',
    }

    // telegramBotToken: env > file > null
    let telegramBotToken: string | null = null
    if (process.env.TELEGRAM_BOT_TOKEN) {
        telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
        sources.telegramBotToken = 'env'
        if (settings.telegramBotToken === undefined) {
            settings.telegramBotToken = telegramBotToken
            needsSave = true
        }
    } else if (settings.telegramBotToken !== undefined) {
        telegramBotToken = settings.telegramBotToken
        sources.telegramBotToken = 'file'
    }

    // allowedChatIds: env > file > []
    let allowedChatIds: number[] = []
    if (process.env.ALLOWED_CHAT_IDS) {
        allowedChatIds = parseChatIds(process.env.ALLOWED_CHAT_IDS)
        sources.allowedChatIds = 'env'
        if (settings.allowedChatIds === undefined) {
            settings.allowedChatIds = allowedChatIds
            needsSave = true
        }
    } else if (settings.allowedChatIds !== undefined) {
        allowedChatIds = settings.allowedChatIds
        sources.allowedChatIds = 'file'
    }

    // webappPort: env > file > 3006
    let webappPort = 3006
    if (process.env.WEBAPP_PORT) {
        const parsed = parseInt(process.env.WEBAPP_PORT, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('WEBAPP_PORT must be a valid port number')
        }
        webappPort = parsed
        sources.webappPort = 'env'
        if (settings.webappPort === undefined) {
            settings.webappPort = webappPort
            needsSave = true
        }
    } else if (settings.webappPort !== undefined) {
        webappPort = settings.webappPort
        sources.webappPort = 'file'
    }

    // webappUrl: env > file > http://localhost:{port}
    let webappUrl = `http://localhost:${webappPort}`
    if (process.env.WEBAPP_URL) {
        webappUrl = process.env.WEBAPP_URL
        sources.webappUrl = 'env'
        if (settings.webappUrl === undefined) {
            settings.webappUrl = webappUrl
            needsSave = true
        }
    } else if (settings.webappUrl !== undefined) {
        webappUrl = settings.webappUrl
        sources.webappUrl = 'file'
    }

    // corsOrigins: env > file > derived from webappUrl
    let corsOrigins: string[]
    if (process.env.CORS_ORIGINS) {
        corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS)
        sources.corsOrigins = 'env'
        if (settings.corsOrigins === undefined) {
            settings.corsOrigins = corsOrigins
            needsSave = true
        }
    } else if (settings.corsOrigins !== undefined) {
        corsOrigins = settings.corsOrigins
        sources.corsOrigins = 'file'
    } else {
        corsOrigins = deriveCorsOrigins(webappUrl)
    }

    // r2AccountId: env > file > null
    let r2AccountId: string | null = null
    if (process.env.HAPI_R2_ACCOUNT_ID) {
        r2AccountId = process.env.HAPI_R2_ACCOUNT_ID
        sources.r2AccountId = 'env'
        if (settings.r2AccountId === undefined) {
            settings.r2AccountId = r2AccountId
            needsSave = true
        }
    } else if (settings.r2AccountId !== undefined) {
        r2AccountId = settings.r2AccountId
        sources.r2AccountId = 'file'
    }

    // r2AccessKeyId: env > file > null
    let r2AccessKeyId: string | null = null
    if (process.env.HAPI_R2_ACCESS_KEY_ID) {
        r2AccessKeyId = process.env.HAPI_R2_ACCESS_KEY_ID
        sources.r2AccessKeyId = 'env'
        if (settings.r2AccessKeyId === undefined) {
            settings.r2AccessKeyId = r2AccessKeyId
            needsSave = true
        }
    } else if (settings.r2AccessKeyId !== undefined) {
        r2AccessKeyId = settings.r2AccessKeyId
        sources.r2AccessKeyId = 'file'
    }

    // r2SecretAccessKey: env > file > null
    let r2SecretAccessKey: string | null = null
    if (process.env.HAPI_R2_SECRET_ACCESS_KEY) {
        r2SecretAccessKey = process.env.HAPI_R2_SECRET_ACCESS_KEY
        sources.r2SecretAccessKey = 'env'
        if (settings.r2SecretAccessKey === undefined) {
            settings.r2SecretAccessKey = r2SecretAccessKey
            needsSave = true
        }
    } else if (settings.r2SecretAccessKey !== undefined) {
        r2SecretAccessKey = settings.r2SecretAccessKey
        sources.r2SecretAccessKey = 'file'
    }

    // r2BucketName: env > file > null
    let r2BucketName: string | null = null
    if (process.env.HAPI_R2_BUCKET_NAME) {
        r2BucketName = process.env.HAPI_R2_BUCKET_NAME
        sources.r2BucketName = 'env'
        if (settings.r2BucketName === undefined) {
            settings.r2BucketName = r2BucketName
            needsSave = true
        }
    } else if (settings.r2BucketName !== undefined) {
        r2BucketName = settings.r2BucketName
        sources.r2BucketName = 'file'
    }

    // r2PublicDomain: env > file > null
    let r2PublicDomain: string | null = null
    if (process.env.HAPI_R2_PUBLIC_DOMAIN) {
        r2PublicDomain = process.env.HAPI_R2_PUBLIC_DOMAIN
        sources.r2PublicDomain = 'env'
        if (settings.r2PublicDomain === undefined) {
            settings.r2PublicDomain = r2PublicDomain
            needsSave = true
        }
    } else if (settings.r2PublicDomain !== undefined) {
        r2PublicDomain = settings.r2PublicDomain
        sources.r2PublicDomain = 'file'
    }

    // r2Region: env > file > 'auto'
    let r2Region = 'auto'
    if (process.env.HAPI_R2_REGION) {
        r2Region = process.env.HAPI_R2_REGION
        sources.r2Region = 'env'
        if (settings.r2Region === undefined) {
            settings.r2Region = r2Region
            needsSave = true
        }
    } else if (settings.r2Region !== undefined) {
        r2Region = settings.r2Region
        sources.r2Region = 'file'
    }

    // r2AutoCreateBucket: env > file > false
    let r2AutoCreateBucket = false
    if (process.env.HAPI_R2_AUTO_CREATE_BUCKET) {
        const value = process.env.HAPI_R2_AUTO_CREATE_BUCKET.toLowerCase()
        r2AutoCreateBucket = value === 'true' || value === '1' || value === 'yes'
        sources.r2AutoCreateBucket = 'env'
        if (settings.r2AutoCreateBucket === undefined) {
            settings.r2AutoCreateBucket = r2AutoCreateBucket
            needsSave = true
        }
    } else if (settings.r2AutoCreateBucket !== undefined) {
        r2AutoCreateBucket = settings.r2AutoCreateBucket
        sources.r2AutoCreateBucket = 'file'
    }

    // r2FileExpirationHours: env > file > 1
    let r2FileExpirationHours = 1
    if (process.env.HAPI_R2_FILE_EXPIRATION_HOURS) {
        const parsed = parseInt(process.env.HAPI_R2_FILE_EXPIRATION_HOURS, 10)
        if (Number.isFinite(parsed) && parsed > 0) {
            r2FileExpirationHours = parsed
            sources.r2FileExpirationHours = 'env'
            if (settings.r2FileExpirationHours === undefined) {
                settings.r2FileExpirationHours = r2FileExpirationHours
                needsSave = true
            }
        } else {
            console.warn('[Server] Invalid HAPI_R2_FILE_EXPIRATION_HOURS, using default: 1 hour')
        }
    } else if (settings.r2FileExpirationHours !== undefined) {
        r2FileExpirationHours = settings.r2FileExpirationHours
        sources.r2FileExpirationHours = 'file'
    }

    // cloudflareApiToken: env > file > null
    let cloudflareApiToken: string | null = null
    if (process.env.HAPI_CLOUDFLARE_API_TOKEN) {
        cloudflareApiToken = process.env.HAPI_CLOUDFLARE_API_TOKEN
        sources.cloudflareApiToken = 'env'
        if (settings.cloudflareApiToken === undefined) {
            settings.cloudflareApiToken = cloudflareApiToken
            needsSave = true
        }
    } else if (settings.cloudflareApiToken !== undefined) {
        cloudflareApiToken = settings.cloudflareApiToken
        sources.cloudflareApiToken = 'file'
    }

    // Default MIME types (matching current hardcoded values in files.ts)
    const DEFAULT_ALLOWED_FILE_TYPES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'application/pdf',
        'text/plain',
        'text/csv',
        'text/markdown',
        'application/json',
        'application/zip',
    ]

    const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024 // 100MB

    // allowedFileTypes: env > file > default
    let allowedFileTypes: string[]
    if (process.env.HAPI_ALLOWED_FILE_TYPES) {
        const parsed = parseAllowedFileTypes(process.env.HAPI_ALLOWED_FILE_TYPES)
        if (parsed.length > 0) {
            allowedFileTypes = parsed
            sources.allowedFileTypes = 'env'
            if (settings.allowedFileTypes === undefined) {
                settings.allowedFileTypes = allowedFileTypes
                needsSave = true
            }
        } else {
            allowedFileTypes = DEFAULT_ALLOWED_FILE_TYPES
        }
    } else if (settings.allowedFileTypes !== undefined && settings.allowedFileTypes.length > 0) {
        allowedFileTypes = settings.allowedFileTypes
        sources.allowedFileTypes = 'file'
    } else {
        allowedFileTypes = DEFAULT_ALLOWED_FILE_TYPES
    }

    // maxFileSizeBytes: env > file > default
    let maxFileSizeBytes: number
    if (process.env.HAPI_MAX_FILE_SIZE_MB) {
        const parsed = parseMaxFileSize(process.env.HAPI_MAX_FILE_SIZE_MB)
        if (parsed > 0) {
            maxFileSizeBytes = parsed
            sources.maxFileSizeBytes = 'env'
            if (settings.maxFileSizeBytes === undefined) {
                settings.maxFileSizeBytes = maxFileSizeBytes
                needsSave = true
            }
        } else {
            maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES
        }
    } else if (settings.maxFileSizeBytes !== undefined && settings.maxFileSizeBytes > 0) {
        maxFileSizeBytes = settings.maxFileSizeBytes
        sources.maxFileSizeBytes = 'file'
    } else {
        maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES
    }

    // Save settings if any new values were added
    if (needsSave) {
        await writeSettings(settingsFile, settings)
    }

    return {
        settings: {
            telegramBotToken,
            allowedChatIds,
            webappPort,
            webappUrl,
            corsOrigins,
            r2AccountId,
            r2AccessKeyId,
            r2SecretAccessKey,
            r2BucketName,
            r2PublicDomain,
            r2Region,
            r2AutoCreateBucket,
            r2FileExpirationHours,
            cloudflareApiToken,
            allowedFileTypes,
            maxFileSizeBytes,
        },
        sources,
        savedToFile: needsSave,
    }
}
