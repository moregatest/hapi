import { Hono } from 'hono'
import { z } from 'zod'
import { configuration } from '../../configuration'
import type { SyncEngine } from '../../sync/syncEngine'
import type { Store } from '../../store'

const bearerSchema = z.string().regex(/^Bearer\s+(.+)$/i)

const authModeSchema = z.enum(['admin', 'project']).optional()

const createOrLoadSessionSchema = z.object({
    tag: z.string().min(1),
    metadata: z.unknown(),
    agentState: z.unknown().nullable().optional(),
    authMode: authModeSchema,
    projectPath: z.string().nullable().optional()
})

const createOrLoadMachineSchema = z.object({
    id: z.string().min(1),
    metadata: z.unknown(),
    daemonState: z.unknown().nullable().optional(),
    authMode: authModeSchema,
    projectPath: z.string().nullable().optional()
})

export function createCliRoutes(getSyncEngine: () => SyncEngine | null, getStore: () => Store | null): Hono {
    const app = new Hono()

    app.use('*', async (c, next) => {
        const raw = c.req.header('authorization')
        if (!raw) {
            return c.json({ error: 'Missing Authorization header' }, 401)
        }

        const parsed = bearerSchema.safeParse(raw)
        if (!parsed.success) {
            return c.json({ error: 'Invalid Authorization header' }, 401)
        }

        const token = parsed.data.replace(/^Bearer\s+/i, '')

        // Check if it's an admin token
        const isAdminToken = token === configuration.cliApiToken

        if (isAdminToken) {
            // Admin token - full access
            c.set('authMode', 'admin')
            c.set('projectPath', null)
            c.set('token', token)
            return await next()
        }

        // Not an admin token - check if it's an existing project token
        const store = getStore()
        const projectToken = store ? store.getProjectToken(token) : null

        if (projectToken) {
            // Existing project token
            c.set('authMode', 'project')
            c.set('projectPath', projectToken.projectPath)
            c.set('token', token)
            return await next()
        }

        // New token - will be registered as project token on first use
        // Allow it through, but mark it as needing registration
        c.set('authMode', 'project')
        c.set('projectPath', null)
        c.set('token', token)
        c.set('isNewProjectToken', true)

        return await next()
    })

    app.post('/sessions', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const json = await c.req.json().catch(() => null)
        const parsed = createOrLoadSessionSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        // Handle project token binding
        const authMode = parsed.data.authMode || c.get('authMode')
        const projectPath = parsed.data.projectPath || c.get('projectPath')

        if (authMode === 'project' && projectPath) {
            const store = getStore()
            const token = c.get('token')
            if (store && token) {
                // Create or get project token binding
                store.getOrCreateProjectToken(token, projectPath)
            }
        }

        const session = engine.getOrCreateSession(parsed.data.tag, parsed.data.metadata, parsed.data.agentState ?? null)
        return c.json({ session })
    })

    app.get('/sessions/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const session = engine.getSession(sessionId)
        if (!session) {
            return c.json({ error: 'Session not found' }, 404)
        }
        return c.json({ session })
    })

    app.post('/machines', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const json = await c.req.json().catch(() => null)
        const parsed = createOrLoadMachineSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        // Handle project token binding
        const authMode = parsed.data.authMode || c.get('authMode')
        const projectPath = parsed.data.projectPath || c.get('projectPath')

        if (authMode === 'project' && projectPath) {
            const store = getStore()
            const token = c.get('token')
            if (store && token) {
                // Create or get project token binding
                store.getOrCreateProjectToken(token, projectPath)
            }
        }

        const machine = engine.getOrCreateMachine(parsed.data.id, parsed.data.metadata, parsed.data.daemonState ?? null)
        return c.json({ machine })
    })

    app.get('/machines/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const machineId = c.req.param('id')
        const machine = engine.getMachine(machineId)
        if (!machine) {
            return c.json({ error: 'Machine not found' }, 404)
        }
        return c.json({ machine })
    })

    return app
}
