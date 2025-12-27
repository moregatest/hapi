# 雙認證系統測試指南

本文檔說明如何測試 HAPI 的雙認證實現（Admin 模式和 Project 模式）。

## 快速開始

### 前置要求

1. **啟動 HAPI Server**：
   ```bash
   cd server
   bun run dev
   # 或
   bun run start
   ```

2. **獲取 CLI_API_TOKEN**：
   - 首次啟動 server 時會自動生成並顯示
   - 或查看 `~/.hapi/settings.json` 文件中的 `cliApiToken` 欄位
   - 或在啟動時設置環境變數 `CLI_API_TOKEN`

### 自動化測試

使用提供的測試腳本進行完整測試：

```bash
# 方式 1: 使用命令行參數
bun run test-dual-auth.ts http://localhost:3006 your-cli-api-token

# 方式 2: 使用環境變數
export HAPI_SERVER_URL=http://localhost:3006
export CLI_API_TOKEN=your-cli-api-token
bun run test-dual-auth.ts

# 方式 3: 如果已設置環境變數，直接運行
bun run test-dual-auth.ts
```

測試腳本會執行以下測試：
1. ✓ Admin 模式認證（CLI_API_TOKEN）
2. ✓ Project 模式認證 - 首次綁定（HAPI_API_TOKEN）
3. ✓ Project 模式認證 - 相同 token，相同路徑
4. ✓ Project 模式認證 - 相同 token，不同路徑
5. ✓ 無效 token 拒絕
6. ✓ 缺少 Authorization header 拒絕
7. ✓ Machines 端點 - Admin 模式
8. ✓ Machines 端點 - Project 模式

## 手動測試

### 測試 1: Admin 模式認證 (CLI_API_TOKEN)

使用管理員 token 創建 session：

```bash
curl -X POST http://localhost:3006/cli/sessions \
  -H "Authorization: Bearer YOUR_CLI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "test-admin-session",
    "metadata": {"test": true},
    "agentState": null,
    "authMode": "admin",
    "projectPath": null
  }'
```

**期望結果**：
- HTTP 200 OK
- 返回包含 session 對象的 JSON

### 測試 2: Project 模式認證 (HAPI_API_TOKEN)

使用項目 token 創建 session（首次綁定）：

```bash
# 生成一個測試用的項目 token（或使用任意字符串）
PROJECT_TOKEN="test-project-token-$(openssl rand -hex 16)"

curl -X POST http://localhost:3006/cli/sessions \
  -H "Authorization: Bearer $PROJECT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "test-project-session",
    "metadata": {"test": true},
    "agentState": null,
    "authMode": "project",
    "projectPath": "/tmp/test-project"
  }'
```

**期望結果**：
- HTTP 200 OK
- Token 自動綁定到 `/tmp/test-project`
- 返回包含 session 對象的 JSON

### 測試 3: 相同項目 Token，相同路徑

使用相同的 PROJECT_TOKEN 再次訪問：

```bash
curl -X POST http://localhost:3006/cli/sessions \
  -H "Authorization: Bearer $PROJECT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "test-project-session-2",
    "metadata": {"test": true},
    "agentState": null,
    "authMode": "project",
    "projectPath": "/tmp/test-project"
  }'
```

**期望結果**：
- HTTP 200 OK
- 成功創建新的 session

### 測試 4: 相同項目 Token，不同路徑

使用相同的 PROJECT_TOKEN 但不同的路徑：

```bash
curl -X POST http://localhost:3006/cli/sessions \
  -H "Authorization: Bearer $PROJECT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "test-project-session-3",
    "metadata": {"test": true},
    "agentState": null,
    "authMode": "project",
    "projectPath": "/tmp/another-project"
  }'
```

**當前實現期望結果**：
- HTTP 200 OK
- Token 已存在於數據庫中，請求成功

**未來增強**：
- 可能限制只能在綁定的項目目錄中使用

### 測試 5: 無效 Token

使用無效的 token 嘗試訪問：

```bash
curl -X POST http://localhost:3006/cli/sessions \
  -H "Authorization: Bearer invalid-token-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "test-invalid",
    "metadata": {"test": true},
    "agentState": null
  }'
```

**期望結果**：
- HTTP 401 Unauthorized
- 返回錯誤消息：`{"error": "Invalid token"}`

### 測試 6: 缺少 Authorization Header

```bash
curl -X POST http://localhost:3006/cli/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "test-no-auth",
    "metadata": {"test": true},
    "agentState": null
  }'
```

**期望結果**：
- HTTP 401 Unauthorized
- 返回錯誤消息：`{"error": "Missing Authorization header"}`

### 測試 7: Token 優先級（CLI 端）

在 CLI 環境中測試 token 優先級：

```bash
# 同時設置兩個 token
export HAPI_API_TOKEN="project-token-123"
export CLI_API_TOKEN="admin-token-456"

# 運行 hapi CLI（需要實際的 hapi CLI）
# hapi 應該優先使用 HAPI_API_TOKEN（項目模式）
```

**期望行為**：
- 優先使用 `HAPI_API_TOKEN`
- Auth mode 應該是 `project`
- Project path 應該是當前工作目錄

## 數據庫驗證

查看項目 token 綁定情況：

```bash
# 連接到 SQLite 數據庫
sqlite3 ~/.hapi/hapi.db

# 查看所有項目 token
SELECT * FROM project_tokens;

# 查看特定路徑的 token
SELECT * FROM project_tokens WHERE project_path = '/tmp/test-project';

# 退出
.exit
```

## 測試 Machines 端點

### Admin 模式

```bash
curl -X POST http://localhost:3006/cli/machines \
  -H "Authorization: Bearer YOUR_CLI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-machine-admin",
    "metadata": {"hostname": "test-host", "test": true},
    "daemonState": null,
    "authMode": "admin",
    "projectPath": null
  }'
```

### Project 模式

```bash
curl -X POST http://localhost:3006/cli/machines \
  -H "Authorization: Bearer $PROJECT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-machine-project",
    "metadata": {"hostname": "test-host", "test": true},
    "daemonState": null,
    "authMode": "project",
    "projectPath": "/tmp/test-project"
  }'
```

## 故障排除

### 問題：獲取 401 Unauthorized

**可能原因**：
1. Token 不正確
2. Server 沒有正確加載 CLI_API_TOKEN
3. Authorization header 格式錯誤

**解決方案**：
1. 檢查 `~/.hapi/settings.json` 中的 token
2. 確認 server 啟動日誌中顯示的 CLI_API_TOKEN
3. 確保使用 `Bearer` 前綴：`Authorization: Bearer TOKEN`

### 問題：數據庫鎖定錯誤

**可能原因**：
- 多個進程同時訪問數據庫

**解決方案**：
- 確保只有一個 server 實例運行
- 檢查是否有殘留的進程

### 問題：Project token 沒有綁定

**可能原因**：
- Server 的 `getStore` 函數沒有正確傳遞
- 數據庫 schema 沒有正確初始化

**解決方案**：
1. 檢查 server 啟動日誌
2. 驗證數據庫 schema：
   ```bash
   sqlite3 ~/.hapi/hapi.db "PRAGMA table_info(project_tokens);"
   ```

## 清理測試數據

```bash
# 刪除測試創建的 project tokens
sqlite3 ~/.hapi/hapi.db "DELETE FROM project_tokens WHERE project_path LIKE '/tmp/test-%';"

# 刪除測試 sessions
sqlite3 ~/.hapi/hapi.db "DELETE FROM sessions WHERE tag LIKE 'test-%';"

# 刪除測試 machines
sqlite3 ~/.hapi/hapi.db "DELETE FROM machines WHERE id LIKE 'test-%';"
```

## 安全注意事項

1. **不要在生產環境中使用測試 token**
2. **定期輪換 CLI_API_TOKEN**
3. **為每個項目使用不同的 HAPI_API_TOKEN**
4. **保護好 ~/.hapi/settings.json 文件權限**（應為 600）
5. **在生產環境中使用 HTTPS**

## 測試檢查清單

- [ ] Admin 模式可以創建 session
- [ ] Admin 模式可以創建 machine
- [ ] Project 模式首次使用時會綁定 token
- [ ] Project 模式可以創建 session
- [ ] Project 模式可以創建 machine
- [ ] 無效 token 被正確拒絕（401）
- [ ] 缺少 Authorization header 被拒絕（401）
- [ ] 數據庫中正確記錄 project_tokens
- [ ] CLI 優先使用 HAPI_API_TOKEN（如果同時設置）
- [ ] CLI 回退到 CLI_API_TOKEN（如果 HAPI_API_TOKEN 未設置）

## 後續測試建議

當實現了項目資源隔離後，還應測試：

1. **資源隔離測試**：
   - Project token 只能訪問綁定項目的 sessions
   - Project token 不能訪問其他項目的 sessions
   - Admin token 可以訪問所有 sessions

2. **Token 管理測試**：
   - Admin 可以創建新的 project tokens
   - Admin 可以撤銷 project tokens
   - Admin 可以查看 token 使用情況

3. **權限範圍測試**：
   - 只讀 project token 不能創建/修改資源
   - 讀寫 project token 可以正常操作

4. **Token 過期測試**：
   - 過期的 token 被正確拒絕
   - 過期時間正確執行
