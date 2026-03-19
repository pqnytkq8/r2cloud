# 利用Cloudflare R2 + Workers搭建在线网盘


[汉化修改自/longern/FlareDrive](https://github.com/longern/FlareDrive)

增加了权限系统，支持多管理员，分别授权目录

cloudflare R2是一个文件储存系统，配合Cloudflare Workers可以实现这样一个网盘系统

### 搭建教程

#### 前置准备
1. Fork 此仓库到你的 GitHub 账户
2. 在 Cloudflare 创建 R2 存储桶
   - 登录 https://dash.cloudflare.com
   - 左侧菜单 → R2 → 创建存储桶
   - **【推荐】关闭"允许公开访问"** - 更安全，所有文件通过 Workers 代理访问，无法直链盗刷
   - 记住存储桶名称

---

# 利用 Cloudflare R2 + Workers 搭建在线网盘

[汉化修改自/longern/FlareDrive](https://github.com/longern/FlareDrive)

增加了权限系统，支持多管理员，分别授权目录。所有文件通过 Cloudflare Workers 代理，支持安全的权限控制。

## 特性

- ✅ 基于 R2 的文件存储
- ✅ 用户权限管理（游客/管理员/普通用户）
- ✅ 文件上传/下载/删除/移动
- ✅ 缩略图生成
- ✅ 完全代理访问（无直链盗刷风险）
- ✅ 支持 Workers 和 Pages 两种部署方式

---

## 快速开始

### 前置准备

1. Fork 此仓库到你的 GitHub 账户
2. 在 Cloudflare 创建 R2 存储桶
   - 登录 https://dash.cloudflare.com
   - R2 → 创建存储桶
   - **【推荐】关闭"允许公开访问"**（由于所有访问都通过 Workers 代理）
   - 记住存储桶名称

---

## 部署方式

### 方案 A：Cloudflare Workers（推荐 ⭐）

**优点**：无需构建，部署最快，支持完整的 API 和文件服务。

**部署步骤**：

1. **连接 GitHub 到 Workers**
   - 登录 https://dash.cloudflare.com
   - Workers 和 Pages → 创建应用程序 → 使用 Git
   - 选择你的 GitHub 账户和 `Cloudflare-R2-oss` 仓库
   - 点击"下一步"

2. **配置构建设置**
   - 框架预设：无
   - 构建命令：留空
   - 构建输出目录：留空
   - 点击"保存并部署"

3. **配置 R2 绑定**
   - 部署完成后，进入项目设置 → 变量和机密
   - 添加 R2 存储桶绑定：
     - 变量名：`BUCKET`
     - R2 存储桶：选择你创建的存储桶

4. **配置环境变量**
   - 同个地方添加以下环境变量：

| 变量名 | 值 | 说明 |
|------|-----|------|
| GUEST | `public/` | 游客允许访问的目录 |
| admin:password123 | `*` | 管理员账户（改为你的密码） |
| user1:password123 | `user1/,docs/` | 普通用户示例 |

   - **格式说明**：
     - 账户：`username:password`
     - 权限：目录路径，多个用 `,` 分隔
     - `*` 表示全部目录

5. **验证**
   - 访问你的 Workers URL
   - 用配置的账户密码登录

---

### 方案 B：Cloudflare Pages

**优点**：Git 自动部署，适合不需要频繁更新的场景。

**部署步骤**：

1. **连接 GitHub 到 Pages**
   - 登录 https://dash.cloudflare.com
   - Pages → 创建项目 → 连接到 Git
   - 选择 fork 的仓库

2. **配置构建**
   - 框架：无
   - 构建命令：留空
   - 构建输出目录：留空

3. **配置 R2 绑定和环境变量**
   - 同 Workers 方案

---

## 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器（需要配置 R2 预览桶）
npm run dev

# 访问 http://localhost:8787
```

---

## 项目结构

```
├── functions/              # Workers 函数
│   ├── _middleware.ts      # 路由中间件
│   ├── api/
│   │   ├── buckets.ts      # 存储桶 API
│   │   ├── children/       # 列表文件 API
│   │   └── write/items/    # 上传/删除 API
│   └── raw/                # 原始文件读取
├── assets/                 # 前端资源
│   ├── App.vue            # 主应用
│   ├── main.mjs           # JS 工具
│   └── main.css           # 样式
├── utils/                  # 工具函数
│   ├── auth.ts            # 权限检查
│   ├── bucket.ts          # R2 操作
│   └── s3.ts              # S3 工具（可选）
└── wrangler.toml          # Workers 配置
```

---

## 环境变量配置详解

### 游客访问

```
GUEST=public/
```
游客可以访问和下载 `public/` 目录下的文件。

### 用户账户

```
username:password=dir1/,dir2/
```
用户 `username` 用密码 `password` 登录后，可以访问 `dir1/` 和 `dir2/` 目录。

### 管理员

```
admin:password=*
```
管理员可以访问所有目录。

### 权限优先级

- 系统文件（`_$flaredrive$/`）：需要写入权限
- 普通文件：匹配用户权限目录即可访问
- 游客优先级最低

---

## 安全说明

✅ **本项目安全特性**：
- 所有文件访问都通过 Workers 代理
- R2 存储桶保持私有状态
- 无法直链盗刷
- 权限严格控制

⚠️ **建议**：
- 定期修改管理员密码
- 不要在环境变量中暴露敏感目录权限
- 定期备份重要文件

---

## 许可证

ISC

## 感谢

- [FlareDrive](https://github.com/longern/FlareDrive) - 原始项目
- [Cloudflare](https://www.cloudflare.com) - 基础设施支持


### 安全说明

**【重要】存储桶配置**
- 所有文件访问都通过 Cloudflare Workers 代理，支持权限验证
- 建议将 R2 存储桶设置为**私有**（不允许公开访问）
- 即使设置为公开，也无法直接通过公开 URL 访问，必须通过应用认证

**【优势】与公开方式的对比**
| 特性 | 私有存储桶（推荐） | 公开存储桶 |
|------|---------|---------|
| 直链盗刷风险 | ❌ 无 | ⚠️ 高 |
| 权限控制 | ✅ 完整 | ⚠️ 仅应用层 |
| 带宽费用 | ✅ 最小化 | ⚠️ 容易超支 |
| 缓存效率 | ✅ 完整 | ✅ 完整 |
| 文件分享 | ✅ 支持临时链接 | ✅ 支持 |
