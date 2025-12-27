/**
 * Token initialization module
 *
 * Handles token initialization with priority:
 * 1. HAPI_API_TOKEN environment variable (project mode - highest priority)
 * 2. CLI_API_TOKEN environment variable (admin mode)
 * 3. Settings file (~/.hapi/settings.json)
 * 4. Interactive prompt (only when all above are missing)
 */

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chalk from 'chalk'
import { configuration } from '@/configuration'
import { readSettings, updateSettings } from '@/persistence'

/**
 * Initialize API token
 * Must be called before any API operations
 * Priority: HAPI_API_TOKEN > CLI_API_TOKEN > settings file > prompt
 */
export async function initializeToken(): Promise<void> {
    // 1. HAPI_API_TOKEN has highest priority (project mode)
    if (configuration.hapiApiToken) {
        return
    }

    // 2. CLI_API_TOKEN from environment
    if (configuration.cliApiToken) {
        return
    }

    // 3. Read from settings file
    const settings = await readSettings()
    if (settings.cliApiToken) {
        configuration._setCliApiToken(settings.cliApiToken)
        return
    }

    // 4. Non-TTY environment cannot prompt, fail with clear error
    if (!process.stdin.isTTY) {
        throw new Error('API token is required. Set HAPI_API_TOKEN or CLI_API_TOKEN via environment variable, or run `hapi auth login`.')
    }

    // 5. Interactive prompt
    const token = await promptForToken()

    // 6. Save and update configuration
    await updateSettings(current => ({
        ...current,
        cliApiToken: token
    }))
    configuration._setCliApiToken(token)
}

async function promptForToken(): Promise<string> {
    const rl = readline.createInterface({ input, output })

    console.log(chalk.yellow('\nNo API token found.'))
    console.log(chalk.gray('Token options:'))
    console.log(chalk.gray('  • Admin mode: Set CLI_API_TOKEN (server-wide access)'))
    console.log(chalk.gray('  • Project mode: Set HAPI_API_TOKEN (project-specific access)'))
    console.log(chalk.gray('\nWhere to find CLI_API_TOKEN:'))
    console.log(chalk.gray('  1. Check the server startup logs (first run shows generated token)'))
    console.log(chalk.gray('  2. Read ~/.hapi/settings.json on the server'))
    console.log(chalk.gray('  3. Ask your server administrator (if token is set via env var)\n'))

    try {
        const token = await rl.question(chalk.cyan('Enter CLI_API_TOKEN: '))
        if (!token.trim()) {
            throw new Error('Token cannot be empty')
        }
        console.log(chalk.green(`\nToken saved to ${configuration.settingsFile}`))
        return token.trim()
    } finally {
        rl.close()
    }
}
