import { configuration } from '@/configuration'
import type { AuthMode } from '@/configuration'

export function getAuthToken(): string {
    const token = configuration.activeToken
    if (!token) {
        throw new Error('API token is required. Set HAPI_API_TOKEN or CLI_API_TOKEN.')
    }
    return token
}

export function getAuthMode(): AuthMode {
    return configuration.authMode
}

export function getProjectPath(): string | null {
    if (configuration.authMode === 'project') {
        return process.cwd()
    }
    return null
}

