# Changelog

All notable changes to this project will be documented in this file.

## [0.1.5] - 2025-12-29

### Fixed

- **WebSocket 認證修復**: WebSocket `/cli` namespace 現在支援 project token 認證，與 REST API 保持一致
  - 修復使用 project token 時 session 顯示離線的問題
  - CLI 現在可以正確發送心跳，保持 session 在線狀態

### Added

- **Web 認證增強**: 支援使用 CLI_API_TOKEN 登入 Web 界面
  - 新增 `/api/auth/cli-login` 端點
  - 前端登入頁面支援 CLI token 輸入
  - 登入後自動重定向到原始請求頁面

- **路由改進**: 
  - 未認證時記住原始 URL，登入後自動跳轉
  - 改進 `ProtectedRoute` 組件的重定向邏輯

### Changed

- 更新 `server/src/socket/server.ts` - WebSocket 認證中間件支援雙認證模式
- 更新 `server/src/web/routes/auth.ts` - 新增 CLI token 登入端點
- 更新 `server/src/web/middleware/auth.ts` - 改進認證中間件
- 更新 `web/src/router.tsx` - 改進路由保護和重定向邏輯
- 更新 `web/src/hooks/useAuth.ts` - 支援 CLI token 登入
- 更新 `cli/src/index.ts` - 改進 CLI 啟動邏輯

## [0.1.4] - 2025-12-28

### Added

- 雙認證系統 (Dual Authentication System)
  - Admin 模式: 使用 `CLI_API_TOKEN`，完整服務器權限
  - Project 模式: 使用 `HAPI_API_TOKEN`，限制特定項目訪問
- Project token 自動綁定機制
- `project_tokens` 資料表用於存儲 token 與項目的綁定關係

### Changed

- 更新 Bun 版本要求至 >= 1.3.5
- 更新依賴: zod, vitest, type packages

## [0.1.3] - 2025-12-25

### Added

- 初始安全審計報告
- 基礎認證機制

---

For more details, see the documentation in `docs/` directory.
