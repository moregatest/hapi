import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { usePlatform } from '@/hooks/usePlatform'
import { CloseIcon } from '@/components/icons'

export function UpdatePrompt() {
    const { isUpdateAvailable, isUpdating, applyUpdate, dismissUpdate } = useServiceWorkerUpdate()
    const { haptic, isTelegram } = usePlatform()

    // Don't show if no update is available
    if (!isUpdateAvailable) {
        return null
    }

    const handleUpdate = async () => {
        haptic.impact('medium')
        await applyUpdate()
    }

    const handleDismiss = () => {
        haptic.impact('light')
        dismissUpdate()
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 bg-[var(--app-secondary-bg)] border border-[var(--app-border)] rounded-lg p-4 shadow-lg z-50">
            <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--app-fg)]">
                        📦 新版本可用!
                    </p>
                    <p className="text-xs text-[var(--app-hint)] mt-0.5">
                        {isTelegram
                            ? '點擊更新以獲取最新功能'
                            : '立即更新以獲取最新功能和改進'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDismiss}
                        disabled={isUpdating}
                        className="shrink-0 px-3 py-2 text-sm text-[var(--app-hint)] active:opacity-60 disabled:opacity-40"
                    >
                        稍後
                    </button>
                    <button
                        onClick={handleUpdate}
                        disabled={isUpdating}
                        className="shrink-0 px-4 py-2 bg-[var(--app-fg)] text-[var(--app-bg)] rounded-lg text-sm font-medium active:opacity-80 disabled:opacity-60 flex items-center gap-2"
                    >
                        {isUpdating ? (
                            <>
                                <span className="inline-block w-4 h-4 border-2 border-[var(--app-bg)] border-t-transparent rounded-full animate-spin" />
                                更新中...
                            </>
                        ) : (
                            '立即更新'
                        )}
                    </button>
                </div>
                {!isUpdating && (
                    <button
                        onClick={handleDismiss}
                        className="shrink-0 p-2 text-[var(--app-hint)] active:opacity-60"
                        aria-label="關閉"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
            {isTelegram && (
                <p className="text-xs text-[var(--app-hint)] mt-2 border-t border-[var(--app-border)] pt-2">
                    提示: 如果更新後仍看不到新功能,請完全關閉並重新開啟 Telegram
                </p>
            )}
        </div>
    )
}
