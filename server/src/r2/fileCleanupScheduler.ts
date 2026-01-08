/**
 * File Cleanup Scheduler
 *
 * Periodically scans for expired files and removes them from both R2 and the database.
 * Runs every 5 minutes to ensure timely cleanup of expired files.
 */

import type { Store } from '../store'
import type { R2Manager } from './r2Manager'

export class FileCleanupScheduler {
    private intervalId: Timer | null = null
    private readonly intervalMs: number = 5 * 60 * 1000 // 5 minutes
    private readonly store: Store
    private readonly r2Manager: R2Manager

    constructor(store: Store, r2Manager: R2Manager) {
        this.store = store
        this.r2Manager = r2Manager
    }

    /**
     * Start the cleanup scheduler
     */
    start(): void {
        if (this.intervalId !== null) {
            console.log('[FileCleanup] Scheduler already running')
            return
        }

        console.log('[FileCleanup] Starting scheduler (runs every 5 minutes)')

        // Run cleanup immediately on start
        this.runCleanup().catch(error => {
            console.error('[FileCleanup] Initial cleanup failed:', error)
        })

        // Schedule periodic cleanup
        this.intervalId = setInterval(() => {
            this.runCleanup().catch(error => {
                console.error('[FileCleanup] Scheduled cleanup failed:', error)
            })
        }, this.intervalMs)
    }

    /**
     * Stop the cleanup scheduler
     */
    stop(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId)
            this.intervalId = null
            console.log('[FileCleanup] Scheduler stopped')
        }
    }

    /**
     * Run cleanup process - delete all expired files
     */
    private async runCleanup(): Promise<void> {
        const currentTime = Date.now()
        const expiredFiles = this.store.getExpiredFiles(currentTime)

        if (expiredFiles.length === 0) {
            console.log('[FileCleanup] No expired files found')
            return
        }

        console.log(`[FileCleanup] Found ${expiredFiles.length} expired files, deleting...`)

        let deletedCount = 0
        let failedCount = 0

        for (const file of expiredFiles) {
            try {
                // Delete from R2
                await this.r2Manager.deleteFile(file.r2Key)

                // Delete from database
                this.store.deleteFile(file.id)

                deletedCount++
                console.log(`[FileCleanup] Deleted: ${file.fileName} (${file.id})`)
            } catch (error: any) {
                failedCount++
                console.error(`[FileCleanup] Failed to delete ${file.fileName} (${file.id}):`, error.message)
            }
        }

        console.log(`[FileCleanup] Cleanup complete: ${deletedCount} deleted, ${failedCount} failed`)
    }

    /**
     * Manually trigger cleanup (useful for testing)
     */
    async triggerCleanup(): Promise<void> {
        await this.runCleanup()
    }
}
