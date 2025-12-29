import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { validateTelegramInitData } from '../telegramInitData'
import { getOrCreateOwnerId } from '../ownerId'
import type { WebAppEnv } from '../middleware/auth'
import type { Store } from '../../store'

const telegramAuthSchema = z.object({
    initData: z.string()
})

const accessTokenAuthSchema = z.object({
    accessToken: z.string()
})

const authBodySchema = z.union([telegramAuthSchema, accessTokenAuthSchema])

export function createAuthRoutes(jwtSecret: Uint8Array, getStore: () => Store | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/auth', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = authBodySchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        let userId: number
        let username: string | undefined
        let firstName: string | undefined
        let lastName: string | undefined
        let authMode: 'admin' | 'project' = 'admin'
        let projectPath: string | undefined

        // Access Token authentication (supports both CLI_API_TOKEN and HAPI_API_TOKEN)
        if ('accessToken' in parsed.data) {
            const token = parsed.data.accessToken

            // Check if it's the admin token
            const isAdminToken = token === configuration.cliApiToken

            if (isAdminToken) {
                // Admin mode - full access
                authMode = 'admin'
                userId = await getOrCreateOwnerId()
                firstName = 'Admin User'
            } else {
                // Not admin token - check if it's a valid project token
                const store = getStore()
                const projectToken = store ? store.getProjectToken(token) : null

                if (projectToken) {
                    // Existing project token
                    authMode = 'project'
                    projectPath = projectToken.projectPath
                    userId = await getOrCreateOwnerId()
                    firstName = 'Project User'
                } else {
                    // New token - allow it as a new project token
                    // It will be registered to a project on first CLI use
                    authMode = 'project'
                    userId = await getOrCreateOwnerId()
                    firstName = 'Project User'
                }
            }
        } else {
            if (!configuration.telegramEnabled || !configuration.telegramBotToken) {
                return c.json({ error: 'Telegram authentication is disabled. Configure TELEGRAM_BOT_TOKEN.' }, 503)
            }

            if (configuration.allowedChatIds.length === 0) {
                return c.json({ error: 'Telegram allowlist is empty. Configure ALLOWED_CHAT_IDS and restart.' }, 403)
            }

            // Telegram initData authentication
            const result = validateTelegramInitData(parsed.data.initData, configuration.telegramBotToken)
            if (!result.ok) {
                return c.json({ error: result.error }, 401)
            }

            const telegramUserId = result.user.id
            if (!configuration.isChatIdAllowed(telegramUserId)) {
                return c.json({ error: 'User not allowed' }, 403)
            }

            userId = await getOrCreateOwnerId()
            username = result.user.username
            firstName = result.user.first_name
            lastName = result.user.last_name
            authMode = 'admin' // Telegram users are always admin
        }

        const payload: { uid: number; authMode: 'admin' | 'project'; projectPath?: string } = { uid: userId, authMode }
        if (projectPath) {
            payload.projectPath = projectPath
        }

        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
            .sign(jwtSecret)

        return c.json({
            token,
            authMode,
            user: {
                id: userId,
                username,
                firstName,
                lastName
            }
        })
    })

    return app
}
