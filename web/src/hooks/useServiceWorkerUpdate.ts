import { useCallback, useEffect, useState } from 'react'
import { Workbox } from 'workbox-window'

const UPDATE_DISMISSED_KEY = 'sw_update_dismissed'
const DISMISS_DURATION = 24 * 60 * 60 * 1000 // 24 hours

function getUpdateDismissed(): number | null {
    try {
        const dismissed = localStorage.getItem(UPDATE_DISMISSED_KEY)
        return dismissed ? parseInt(dismissed, 10) : null
    } catch {
        return null
    }
}

function setUpdateDismissed(): void {
    try {
        localStorage.setItem(UPDATE_DISMISSED_KEY, Date.now().toString())
    } catch {
        // Ignore storage errors
    }
}

function clearUpdateDismissed(): void {
    try {
        localStorage.removeItem(UPDATE_DISMISSED_KEY)
    } catch {
        // Ignore storage errors
    }
}

export function useServiceWorkerUpdate(): {
    isUpdateAvailable: boolean
    isUpdating: boolean
    applyUpdate: () => Promise<void>
    dismissUpdate: () => void
    isDismissed: boolean
} {
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
    const [isUpdating, setIsUpdating] = useState(false)
    const [isDismissed, setIsDismissed] = useState(false)
    const [wb, setWb] = useState<Workbox | null>(null)

    useEffect(() => {
        // Only run in production and if service worker is supported
        if (!('serviceWorker' in navigator)) {
            return
        }

        // Check if update was dismissed recently
        const dismissedAt = getUpdateDismissed()
        if (dismissedAt && Date.now() - dismissedAt < DISMISS_DURATION) {
            setIsDismissed(true)
        }

        const workbox = new Workbox('/sw.js')

        // Listen for waiting event - new SW installed but not yet activated
        workbox.addEventListener('waiting', () => {
            // Only show prompt if not recently dismissed
            const dismissedAt = getUpdateDismissed()
            if (!dismissedAt || Date.now() - dismissedAt >= DISMISS_DURATION) {
                setIsUpdateAvailable(true)
                setIsDismissed(false)
                clearUpdateDismissed()
            }
        })

        // Listen for controlling event - new SW has taken control
        workbox.addEventListener('controlling', () => {
            // Reload the page to load new content
            window.location.reload()
        })

        // Register the service worker
        workbox
            .register()
            .then((registration) => {
                if (registration) {
                    // Check for updates periodically (every hour)
                    setInterval(
                        () => {
                            registration.update()
                        },
                        60 * 60 * 1000
                    )
                }
            })
            .catch((error) => {
                console.error('Service worker registration failed:', error)
            })

        setWb(workbox)

        // Cleanup function
        return () => {
            // Note: Workbox doesn't provide a cleanup method
            // The service worker will remain registered
        }
    }, [])

    const applyUpdate = useCallback(async () => {
        if (!wb) {
            return
        }

        setIsUpdating(true)

        try {
            // Send SKIP_WAITING message to the waiting service worker
            await wb.messageSkipWaiting()
            // The 'controlling' event listener will trigger reload
        } catch (error) {
            console.error('Failed to apply update:', error)
            setIsUpdating(false)
            // Fallback: just reload the page
            window.location.reload()
        }
    }, [wb])

    const dismissUpdate = useCallback(() => {
        setIsDismissed(true)
        setIsUpdateAvailable(false)
        setUpdateDismissed()
    }, [])

    return {
        isUpdateAvailable: isUpdateAvailable && !isDismissed,
        isUpdating,
        applyUpdate,
        dismissUpdate,
        isDismissed
    }
}
