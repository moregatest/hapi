import { Hono } from 'hono'
import type { R2Manager } from '../../r2/r2Manager'
import type { SyncEngine } from '../../sync/syncEngine'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

const ALLOWED_MIME_TYPES = [
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

export function createFilesRoutes(
    getR2Manager: () => R2Manager | null,
    getSyncEngine: () => SyncEngine | null,
    getStore: () => Store | null
): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    // POST /api/files - Upload file
    app.post('/', async (c) => {
        const r2Manager = getR2Manager()
        if (!r2Manager) {
            return c.json({ error: 'File upload not available' }, 503)
        }

        const store = getStore()
        if (!store) {
            return c.json({ error: 'Store not available' }, 503)
        }
        const authMode = c.get('authMode') as 'admin' | 'project' | undefined
        const projectPath = c.get('projectPath') as string | null | undefined

        try {
            // Parse multipart form data
            const formData = await c.req.formData()
            const file = formData.get('file') as File | null
            const sessionId = formData.get('sessionId') as string | null

            if (!file) {
                return c.json({ error: 'No file provided' }, 400)
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                return c.json({ error: 'File too large (max 100MB)' }, 400)
            }

            // Validate file type
            if (!ALLOWED_MIME_TYPES.includes(file.type)) {
                return c.json({ error: 'File type not allowed' }, 400)
            }

            // Permission check
            if (authMode === 'project' && sessionId) {
                // Project mode: verify session belongs to current project
                const session = store.getSession(sessionId)
                if (!session) {
                    return c.json({ error: 'Session not found' }, 404)
                }

                // Check if session's project path matches auth project path
                const sessionMetadata = session.metadata as any
                const sessionProjectPath = sessionMetadata?.path
                if (sessionProjectPath !== projectPath) {
                    return c.json({ error: 'Forbidden' }, 403)
                }
            }

            // Convert file to buffer
            const arrayBuffer = await file.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)

            // Upload to R2
            const uploadResult = await r2Manager.uploadFile({
                buffer,
                fileName: file.name,
                contentType: file.type,
                sessionId: sessionId || undefined,
                projectPath: authMode === 'project' ? (projectPath || undefined) : undefined,
            })

            // Store in database
            const storedFile = store.addFile({
                sessionId: sessionId || null,
                projectPath: authMode === 'project' ? (projectPath || null) : null,
                fileName: file.name,
                fileSize: file.size,
                contentType: file.type,
                r2Key: uploadResult.key,
                publicUrl: uploadResult.publicUrl,
                uploadedBy: 'webapp',
                createdAt: Date.now(),
                expiresAt: uploadResult.expiresAt,
                metadata: null,
            })

            // Send notification if session is active
            if (sessionId) {
                const syncEngine = getSyncEngine()
                const session = store.getSession(sessionId)
                if (syncEngine && session && session.active) {
                    await syncEngine.sendFileUploadNotification(sessionId, storedFile)
                }
            }

            return c.json({ file: storedFile })
        } catch (error: any) {
            console.error('[Files] Upload error:', error)
            return c.json({ error: 'Upload failed' }, 500)
        }
    })

    // GET /api/files - List files
    app.get('/', async (c) => {
        const r2Manager = getR2Manager()
        if (!r2Manager) {
            return c.json({ error: 'File upload not available' }, 503)
        }

        const store = getStore()
        if (!store) {
            return c.json({ error: 'Store not available' }, 503)
        }
        const authMode = c.get('authMode') as 'admin' | 'project' | undefined
        const projectPath = c.get('projectPath') as string | null | undefined
        const sessionId = c.req.query('sessionId')

        try {
            let files

            if (authMode === 'admin') {
                // Admin mode: can query any session or all files
                if (sessionId) {
                    files = store.getFilesBySession(sessionId)
                } else {
                    // Return all files (limited)
                    files = store.getFilesByProject('') // Empty project path won't match anything
                }
            } else if (authMode === 'project') {
                // Project mode: only return files for current project
                if (sessionId) {
                    // Verify session belongs to project
                    const session = store.getSession(sessionId)
                    if (!session) {
                        return c.json({ error: 'Session not found' }, 404)
                    }

                    const sessionMetadata = session.metadata as any
                    const sessionProjectPath = sessionMetadata?.path
                    if (sessionProjectPath !== projectPath) {
                        return c.json({ error: 'Forbidden' }, 403)
                    }

                    files = store.getFilesBySession(sessionId)
                } else {
                    // Return all files for current project
                    files = store.getFilesByProject(projectPath || '')
                }
            } else {
                return c.json({ error: 'Unauthorized' }, 401)
            }

            return c.json({ files })
        } catch (error: any) {
            console.error('[Files] List error:', error)
            return c.json({ error: 'Failed to list files' }, 500)
        }
    })

    // DELETE /api/files/:id - Delete file
    app.delete('/:id', async (c) => {
        const r2Manager = getR2Manager()
        if (!r2Manager) {
            return c.json({ error: 'File upload not available' }, 503)
        }

        const store = getStore()
        if (!store) {
            return c.json({ error: 'Store not available' }, 503)
        }
        const authMode = c.get('authMode') as 'admin' | 'project' | undefined
        const projectPath = c.get('projectPath') as string | null | undefined
        const fileId = c.req.param('id')

        try {
            // Get file
            const file = store.getFile(fileId)
            if (!file) {
                return c.json({ error: 'File not found' }, 404)
            }

            // Permission check
            if (authMode === 'project') {
                // Project mode: can only delete files from current project
                if (file.projectPath !== projectPath) {
                    return c.json({ error: 'Forbidden' }, 403)
                }
            }

            // Delete from R2
            await r2Manager.deleteFile(file.r2Key)

            // Delete from database
            store.deleteFile(fileId)

            return c.json({ ok: true })
        } catch (error: any) {
            console.error('[Files] Delete error:', error)
            return c.json({ error: 'Failed to delete file' }, 500)
        }
    })

    return app
}
