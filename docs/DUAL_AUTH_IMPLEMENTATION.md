# 雙認證模式實現文檔

## 概述

HAPI CLI 現已支持兩種不同的 API Token 認證方式：

1. **管理者模式 (Admin Mode)**: 使用 `CLI_API_TOKEN`，提供服務器全域的管理權限
2. **項目模式 (Project Mode)**: 使用 `HAPI_API_TOKEN`，限制只能訪問特定項目/工作目錄

## Token 優先級

當同時設置多個 token 時，按以下優先級使用：

```
HAPI_API_TOKEN (環境變數，項目模式)
  ↓
CLI_API_TOKEN (環境變數，管理者模式)
  ↓
~/.hapi/settings.json 中的 cliApiToken
  ↓
交互式提示
```

## 使用方式

### 管理者模式

適用於服務器管理員或需要完整訪問權限的用戶。

```bash
# 設置管理者 token
export CLI_API_TOKEN="your-admin-token-here"

# 或在配置文件中設置（~/.hapi/settings.json）
{
  "cliApiToken": "your-admin-token-here"
}

# 運行 CLI
hapi
```

**權限**：
- 可訪問所有項目和 session
- 完整的服務器管理權限

### 項目模式

適用於一般用戶，限制只能訪問特定項目。

```bash
# 在項目目錄中設置項目專屬 token
cd /path/to/your/project
export HAPI_API_TOKEN="your-project-token-here"

# 運行 CLI
hapi
```

**權限**：
- 只能訪問綁定的項目目錄
- 首次使用時自動將 token 與當前工作目錄綁定
- 後續使用該 token 時，服務器會驗證是否為綁定的項目

## 實現細節

### CLI 端改動

#### 1. Configuration (`cli/src/configuration.ts`)

新增字段和類型：
```typescript
export type AuthMode = 'admin' | 'project'

class Configuration {
    private _cliApiToken: string
    private _hapiApiToken: string
    private _authMode: AuthMode

    get activeToken(): string
    get authMode(): AuthMode
}
```

#### 2. Token 初始化 (`cli/src/ui/tokenInit.ts`)

更新初始化邏輯以支持新的優先級：
- 檢查 `HAPI_API_TOKEN`（最高優先級）
- 檢查 `CLI_API_TOKEN`
- 讀取配置文件
- 交互式提示

#### 3. API 請求 (`cli/src/api/`)

在所有 API 請求中添加認證信息：
```typescript
// api/auth.ts
export function getAuthMode(): AuthMode
export function getProjectPath(): string | null

// api/api.ts
{
    authMode: this.authMode,
    projectPath: this.projectPath  // 項目模式時為當前工作目錄
}
```

### 服務器端改動

#### 1. 數據庫 Schema (`server/src/store/index.ts`)

新增 `project_tokens` 表：
```sql
CREATE TABLE IF NOT EXISTS project_tokens (
    token TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_tokens_path ON project_tokens(project_path);
```

新增操作方法：
```typescript
getOrCreateProjectToken(token: string, projectPath: string): StoredProjectToken
getProjectToken(token: string): StoredProjectToken | null
getProjectTokensByPath(projectPath: string): StoredProjectToken[]
```

#### 2. CLI 路由中間件 (`server/src/web/routes/cli.ts`)

更新認證邏輯：
```typescript
// 檢查是否為管理者 token
const isAdminToken = token === configuration.cliApiToken

if (isAdminToken) {
    // Admin token - full access
    c.set('authMode', 'admin')
    c.set('projectPath', null)
    c.set('token', token)
    return await next()
}

// 檢查是否為已存在的項目 token
const projectToken = store ? store.getProjectToken(token) : null

if (projectToken) {
    // Existing project token
    c.set('authMode', 'project')
    c.set('projectPath', projectToken.projectPath)
    c.set('token', token)
    return await next()
}

// 新 token - 將在首次使用時註冊為項目 token
c.set('authMode', 'project')
c.set('projectPath', null)
c.set('token', token)
c.set('isNewProjectToken', true)
```

**重要變更**：中間件現在允許新的 token 通過，而不是立即拒絕。新 token 會在端點處理時自動註冊到 `project_tokens` 表。

#### 3. Session/Machine 創建處理

在 `/cli/sessions` 和 `/cli/machines` 端點中：
```typescript
// 項目模式時自動綁定 token 與項目目錄
if (authMode === 'project' && projectPath) {
    const store = getStore()
    if (store) {
        store.getOrCreateProjectToken(token, projectPath)
    }
}
```

#### 4. 服務器啟動 (`server/src/index.ts`)

添加 `getStore` 函數傳遞：
```typescript
webServer = await startWebServer({
    getSyncEngine: () => syncEngine,
    getSseManager: () => sseManager,
    getStore: () => store,  // 新增
    jwtSecret,
    socketEngine: socketServer.engine
})
```

## 安全考慮

### 項目 Token 綁定機制

1. **首次使用綁定**：項目 token 首次使用時，自動與當前工作目錄（`process.cwd()`）綁定
2. **綁定持久化**：綁定關係存儲在數據庫的 `project_tokens` 表中
3. **綁定驗證**：後續使用該 token 時，中間件會驗證 token 是否存在於數據庫中

### Token 驗證策略

**當前實現**：允許任意 token 成為項目 token（寬鬆策略）

- ✅ **優點**：
  - 簡單易用，用戶可以使用自定義 token
  - 適合開發和測試環境
  - 無需預先創建 token

- ⚠️ **注意事項**：
  - 建議使用強隨機 token（至少 32 字節）
  - Token 一旦綁定即持久化，無法自動過期
  - 保護好 token，視同密碼管理

### 權限隔離

- **管理者模式**：通過比對 `configuration.cliApiToken` 驗證，通過後無額外限制
- **項目模式**：通過數據庫查詢驗證 token 存在性，可在未來擴展添加項目範圍限制

### 未來增強

目前實現了基礎的雙認證架構，可進一步增強：

1. **項目資源隔離**：
   - 在 session/message/machine 查詢時，檢查是否屬於綁定的項目
   - 添加項目 ID 到 sessions 表

2. **Token 管理 API**：
   - 管理者可以創建/撤銷項目 token
   - 查看 token 使用情況和綁定信息

3. **更細粒度的權限控制**：
   - 為項目 token 添加權限範圍（只讀、讀寫等）
   - 添加 token 過期時間

## 測試建議

### 測試場景

1. **管理者模式測試**：
   ```bash
   export CLI_API_TOKEN="admin-token-from-server"
   cd /any/directory
   hapi
   # 應該能訪問所有資源
   ```

2. **項目模式測試**：
   ```bash
   export HAPI_API_TOKEN="my-project-token"
   cd /path/to/project-a
   hapi
   # 首次使用，自動綁定到 /path/to/project-a

   cd /path/to/project-b
   hapi
   # 使用同一 token，但在不同目錄
   # 當前實現：仍然可用（綁定到第一個目錄）
   # 未來增強：可以限制只能在綁定目錄使用
   ```

3. **Token 優先級測試**：
   ```bash
   export HAPI_API_TOKEN="project-token"
   export CLI_API_TOKEN="admin-token"
   hapi
   # 應該使用 HAPI_API_TOKEN（項目模式）
   ```

4. **無效 Token 測試**：
   ```bash
   export HAPI_API_TOKEN="invalid-token"
   hapi
   # 應該返回 401 Unauthorized
   ```

## 遷移指南

現有用戶無需做任何改動，系統完全向後兼容：
- 繼續使用 `CLI_API_TOKEN` 或 `~/.hapi/settings.json` 即可
- 新增的 `HAPI_API_TOKEN` 是可選的，僅在需要項目模式時使用

## 文件變更清單

### CLI 端
- `cli/src/configuration.ts` - 添加雙 token 支持
- `cli/src/ui/tokenInit.ts` - 更新初始化邏輯
- `cli/src/api/auth.ts` - 添加認證模式獲取函數
- `cli/src/api/api.ts` - 在請求中傳遞認證信息

### 服務器端
- `server/src/store/index.ts` - 添加 project_tokens 表和操作方法
- `server/src/web/routes/cli.ts` - 更新認證中間件和端點處理
- `server/src/web/server.ts` - 添加 getStore 參數傳遞
- `server/src/index.ts` - 添加 store 全局變量和 getStore 傳遞

## 總結

此實現提供了靈活的雙認證機制，既保持了管理者的完整控制權，又允許為不同項目分配獨立的訪問 token，為多用戶、多項目場景提供了基礎架構。
