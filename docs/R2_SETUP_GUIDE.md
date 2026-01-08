# R2 文件上傳設定指南

本文檔說明如何完成 Cloudflare R2 的配置，以啟用 HAPI 的文件上傳功能。

## ✅ 已完成的設定

以下設定已通過 `wrangler` CLI 完成：

1. **R2 Bucket 創建**
   - Bucket Name: `hapi-uploads`
   - Storage Class: Standard
   - 狀態：✅ 已創建

2. **公開訪問啟用 (R2.dev)**
   - Public URL: `https://pub-1aa7a21a8c7d45c89789435f32d828da.r2.dev`
   - 狀態：✅ 已啟用

3. **環境變數配置**
   - 文件：`.env`
   - 狀態：✅ 已配置模板

## 🔑 需要手動完成：創建 R2 API Token

由於安全原因，R2 API credentials 需要在 Cloudflare Dashboard 中手動創建。

### 步驟說明

1. **打開 R2 API Tokens 頁面**
   ```
   https://dash.cloudflare.com/bca340284e84bc9024a7a40b70b83389/r2/api-tokens
   ```

2. **創建新的 API Token**
   - 點擊 "Create API Token" 或 "Manage R2 API Tokens"
   - Token Name: `hapi-server-access`

3. **設定權限**
   - 權限類型：**Object Read & Write** (推薦) 或 **Admin Read & Write**
   - 應用範圍：選擇特定 bucket `hapi-uploads`

4. **生成並複製 Credentials**
   系統會生成兩個值：
   - **Access Key ID** (類似 AWS Access Key)
   - **Secret Access Key** (類似 AWS Secret Key)

   ⚠️ **重要**：Secret Access Key 只會顯示一次，請立即複製！

5. **更新 .env 文件**
   打開 `.env` 文件，替換以下兩行：
   ```bash
   HAPI_R2_ACCESS_KEY_ID=<YOUR_ACCESS_KEY_ID>
   HAPI_R2_SECRET_ACCESS_KEY=<YOUR_SECRET_ACCESS_KEY>
   ```

   替換為實際的值：
   ```bash
   HAPI_R2_ACCESS_KEY_ID=a1b2c3d4e5f6...
   HAPI_R2_SECRET_ACCESS_KEY=x1y2z3w4v5...
   ```

## 📋 當前配置摘要

```bash
# R2 Account
Account ID: bca340284e84bc9024a7a40b70b83389
Email: software@ready-market.com

# R2 Bucket
Bucket Name: hapi-uploads
Public URL: https://pub-1aa7a21a8c7d45c89789435f32d828da.r2.dev
Region: auto
Storage Class: Standard

# 文件生命周期
Expiration Time: 1 hour (自動清理)
Cleanup Interval: 5 minutes
```

## 🧪 測試配置

完成 API Token 設定後，執行以下命令測試：

```bash
# 1. 啟動 HAPI Server
cd /Users/tung/Codes/hapi/server
bun run dev

# 2. 檢查日誌
# 應該看到：
# [Server] R2: enabled (bucket: hapi-uploads)
# [Server] R2: bucket verified/created
# [FileCleanup] Starting scheduler (runs every 5 minutes)
```

## 🔍 驗證 R2 連接

使用 wrangler 上傳測試文件：

```bash
# 創建測試文件
echo "Hello HAPI R2!" > test.txt

# 上傳到 R2
wrangler r2 object put hapi-uploads/test.txt --file test.txt

# 驗證公開訪問
curl https://pub-1aa7a21a8c7d45c89789435f32d828da.r2.dev/test.txt

# 刪除測試文件
wrangler r2 object delete hapi-uploads/test.txt
rm test.txt
```

## 📚 其他 Wrangler 命令

```bash
# 查看 bucket 資訊
wrangler r2 bucket info hapi-uploads

# 列出所有文件
wrangler r2 object list hapi-uploads

# 查看 R2.dev URL 狀態
wrangler r2 bucket dev-url get hapi-uploads

# 停用 R2.dev URL (如果需要)
wrangler r2 bucket dev-url disable hapi-uploads
```

## 🔒 安全建議

1. **不要提交 .env 文件到 git**
   - 已包含在 `.gitignore` 中
   - 確保 API credentials 不會外洩

2. **定期輪換 API Token**
   - 建議每 90 天更換一次
   - 舊 token 可在 Dashboard 中撤銷

3. **最小權限原則**
   - 使用 "Object Read & Write" 而非 "Admin"
   - 僅授權 `hapi-uploads` bucket

4. **監控使用量**
   - 在 Cloudflare Dashboard 中監控 R2 使用量
   - 設置用量警報

## 🚀 功能特性

配置完成後，HAPI 將支持：

- ✅ 通過 Web 界面上傳文件（圖片、PDF、文檔等）
- ✅ 自動生成公開訪問 URL
- ✅ 文件自動在 1 小時後過期
- ✅ 每 5 分鐘自動清理過期文件
- ✅ 上傳成功自動通知 Claude
- ✅ 支持 Admin 和 Project 雙認證模式
- ✅ 最大文件大小：100MB
- ✅ 支持的文件類型：圖片、PDF、文本、壓縮包

## 🎛️ 自定義文件限制（可選）

您可以通過環境變數自定義允許的文件類型和最大文件大小：

```bash
# 限制為僅圖片和 PDF（逗號分隔的 MIME 類型）
export HAPI_ALLOWED_FILE_TYPES="image/jpeg,image/png,application/pdf"

# 設置最大文件大小為 50MB（默認為 100MB）
export HAPI_MAX_FILE_SIZE_MB=50
```

**默認配置：**
- 允許的文件類型：image/jpeg, image/png, image/gif, image/webp, image/svg+xml, application/pdf, text/plain, text/csv, text/markdown, application/json, application/zip
- 最大文件大小：100MB

**注意：**
- 如果不設置這些環境變數，將使用上述默認值
- 設置會自動保存到 `~/.hapi/settings.json`
- 最大文件大小不能超過 1000MB

## 📞 需要幫助？

如果遇到問題：

1. 檢查 `.env` 文件中的配置是否正確
2. 確認 R2 API Token 權限是否正確
3. 查看 Server 日誌中的錯誤訊息
4. 使用 `wrangler r2 bucket info hapi-uploads` 驗證 bucket 存在

---

Generated with [Claude Code](https://claude.com/claude-code)
via [HAPI](https://happy.engineering)
