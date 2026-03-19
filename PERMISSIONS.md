# 下载权限问题排查和修复指南

## 问题症状

下载文件时收到 `Unauthorized` 错误：
```
GET /raw/100MB.bin
Response: Unauthorized (401)
```

## 根本原因

### 1. 权限配置问题

当前 `wrangler.toml` 配置：
```toml
[vars]
GUEST = "public/"
"admin:666" = "*"
```

**含义**：
- 游客只能访问 `public/` 目录下的文件
- 文件 `100MB.bin` 不在 `public/` 目录中，所以被拒绝

### 2. 修复方案

#### 方案 A：将文件移到 public 目录（推荐开发环境）

```toml
[vars]
GUEST = "public/"
"admin:666" = "*"
```

然后上传文件到 `public/100MB.bin`，这样游客就能访问

#### 方案 B：扩展游客访问权限

```toml
[vars]
# 游客可访问多个目录
GUEST = "public/,downloads/"
"admin:666" = "*"
```

#### 方案 C：开放所有权限（仅测试用）

```toml
[vars]
# 游客可访问所有目录
GUEST = "*"
"admin:666" = "*"
```

#### 方案 D：使用认证访问（生产推荐）

使用 Basic Auth 登录：

```bash
# 使用 curl 下载
curl -u "admin:666" https://cloud.5671234.xyz/raw/100MB.bin -o 100MB.bin

# 使用浏览器
# 在 URL 前添加认证：https://admin:666@cloud.5671234.xyz/raw/100MB.bin
```

## 权限优先级

```
┌─────────────────────────────────────┐
│  1️⃣ 游客权限（GUEST）              │ ← 无需认证，最快
│     如果匹配 GUEST 路径，直接允许   │
├─────────────────────────────────────┤
│  2️⃣ 认证用户权限                   │ ← 需要 Authorization 头
│     Basic Auth (username:password)  │
├─────────────────────────────────────┤
│  3️⃣ 系统文件权限                   │ ← 缩略图等内部文件
│     路径以 _$flaredrive$/ 开头     │
├─────────────────────────────────────┤
│  ❌ 都不匹配 → 401 Unauthorized    │
└─────────────────────────────────────┘
```

## 完整的权限配置示例

### 开发环境（宽松）

```toml
[vars]
# 所有目录都向游客开放
GUEST = "*"
# admin 账户（密码 pass123）
"admin:pass123" = "*"
# user 账户（只能访问 user/ 目录）
"user:pass456" = "user/"
```

### 生产环境（严格）

```toml
[vars]
# 仅 public 和 downloads 向游客开放
GUEST = "public/,downloads/"
# admin 账户有完全权限
"admin:secure_password_123" = "*"
# upload 用户只能上传到 uploads/ 目录
"uploader:upload_password" = "uploads/"
```

## 诊断步骤

### 1. 检查当前配置

```bash
# 查看 wrangler.toml
cat wrangler.toml | grep -A 2 "^\\[vars\\]"
```

### 2. 测试游客访问

```bash
# 无认证访问（游客）
curl https://cloud.5671234.xyz/raw/100MB.bin
# 应该返回文件内容或 Unauthorized

# 查看响应头
curl -i https://cloud.5671234.xyz/raw/100MB.bin
```

### 3. 测试认证访问

```bash
# 使用 admin 账户访问
curl -u "admin:666" https://cloud.5671234.xyz/raw/100MB.bin -o 100MB.bin
```

### 4. 检查文件权限配置

在 `wrangler.toml` 中验证：

- ✅ `GUEST = "*"` 或包含文件路径
- ✅ 用户账户和权限配置正确
- ✅ 文件路径不以 `_$flaredrive$/` 开头（系统文件）

## 常见错误

| 错误 | 原因 | 解决方案 |
|-----|------|--------|
| `Unauthorized` | 文件不在 GUEST 权限范围 | 扩展 GUEST 权限或使用 Basic Auth |
| `Not found` | 文件不存在 | 确认文件已上传到 R2 |
| `Server Error` | 权限检查异常 | 检查日志：`wrangler tail` |
| `304 Not Modified` | 文件未变化 | 这不是错误，用于缓存优化 |

## 快速修复

### 修复 1：允许游客访问所有内容（仅测试）

```bash
# 编辑 wrangler.toml
sed -i 's/GUEST = ".*"/GUEST = "*"/' wrangler.toml

# 部署
npm run build
wrangler deploy
```

### 修复 2：允许游客访问特定路径

```bash
# 编辑 wrangler.toml
# 将 GUEST = "public/" 改为
# GUEST = "public/,files/,downloads/"

# 部署
npm run build
wrangler deploy
```

### 修复 3：使用用户认证访问

```bash
# 下载时使用 admin:666 认证
curl -u "admin:666" https://cloud.5671234.xyz/raw/100MB.bin -o 100MB.bin

# 在浏览器中使用
# https://admin:666@cloud.5671234.xyz/raw/100MB.bin
```

## 权限缓存

由于权限检查结果被缓存 30 分钟，修改权限后：

1. 修改 `wrangler.toml`
2. 运行 `npm run build && wrangler deploy`
3. 等待 30 分钟缓存过期，或
4. 清空 KV 缓存：`wrangler kv:key delete auth:r:guest:100MB.bin --binding CACHE`

## 推荐配置

- **开发环境**：`GUEST = "*"` （所有文件可公开访问）
- **测试环境**：`GUEST = "public/"` （仅公开目录）
- **生产环境**：`GUEST = ""` （仅限认证用户）或 `GUEST = "downloads/"` （限定目录）

---

**需要帮助？** 检查 logs：`wrangler tail`
