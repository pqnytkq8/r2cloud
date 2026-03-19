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

## 部署方式选择

### 方案 A：Cloudflare Workers（推荐 - 最简单）

**优点**：
- ✅ 直接从 GitHub 连接，自动部署
- ✅ 无需构建命令
- ✅ 支持 SPA 路由重定向

**步骤**：

1. **在 Workers 中连接 GitHub**
   - 登录 https://dash.cloudflare.com
   - 左侧菜单 → Workers 和 Pages → 概述
   - 点击"创建应用程序" → "使用 Git" 
   - 选择你的 GitHub 账户（luckyf1oat）和 fork 的 `Cloudflare-R2-oss` 仓库
   - 点击"下一步"继续

2. **配置构建设置**
   - 框架预设：选择"无"
   - 构建命令：保持空白或输入 `npm run build`
   - 构建输出目录：留空
   - 点击"保存并部署"

3. **配置 R2 存储桶绑定**
   - 部署完成后，进入 Workers 项目设置
   - 左侧菜单 → 设置 → 变量和机密
   - 点击"编辑变量"
   - 添加 R2 存储桶绑定：
     - 变量名称：`BUCKET`
     - 类型：`R2 存储桶`
     - 存储桶：选择你创建的 R2 存储桶
   - 保存

4. **配置环境变量**
   - 继续在变量列表中添加以下环境变量：

| 变量名称 | 值 | 说明 |
|---------|-----|------|
| GUEST | `public/` | 游客允许读取/写入的目录 |
| admin:123456 | `*` | 管理员账户（改为你的密码） |
| user1:password | `user1/` | 普通用户示例 |

5. **验证部署**
   - 访问你的 Workers URL
   - 用配置的账户密码登录测试

---

### 方案 B：Cloudflare Pages（传统方式）

**步骤**：

1. **在 Pages 中部署**
   - 登录 https://dash.cloudflare.com
   - 左侧菜单 → Pages → 创建项目 → 连接到 Git
   - 选择 fork 的仓库
   - 项目名称自定义，其他保持默认
   - 部署项目

2. **配置 R2 存储桶绑定**
   - 部署完成后，进入项目设置 → 函数 → R2 存储桶绑定
   - 点击"添加绑定"
   - 变量名称：`BUCKET`
   - 存储桶：选择你创建的 R2 存储桶
   - 保存并重新部署

3. **配置环境变量**
   - 在项目设置 → 环境变量中添加环境变量

---

#### 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev

# 访问 http://localhost:8787
```

#### 命令行部署

```bash
# 部署到 Workers（需要 wrangler 认证）
npm run deploy

# 部署到 Pages
npm run deploy:pages
```

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
