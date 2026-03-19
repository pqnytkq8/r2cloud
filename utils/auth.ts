/**
 * 检查权限（内部实现，不含缓存）
 */
function checkAuthPermission(context, dopath) {
    if(context.env["GUEST"]){
        if(dopath.startsWith("_$flaredrive$/thumbnails/"))return true;
        const allow_guest = context.env["GUEST"].split(",")
        for (var aa of allow_guest){
            if(aa == "*" || dopath.startsWith(aa)) return true;
        }
    }
    
    const authHeader = context.request.headers.get('Authorization');
    if(!authHeader) return false;
    
    try {
        const account = atob(authHeader.split("Basic ")[1]);
        if(!account || !context.env[account]) return false;
        if(dopath.startsWith("_$flaredrive$/thumbnails/")) return true;
        
        const allow = context.env[account].split(",")
        for (var a of allow){
            if(a == "*" || dopath.startsWith(a)) return true;
        }
    } catch(e) {}
    return false;
}

/**
 * 检查用户是否有权限写入指定路径（带缓存）
 */
export async function get_auth_status(context) {
    const dopath = context.request.url.split("/api/write/items/")[1];
    const authHeader = context.request.headers.get('Authorization') || 'guest';
    const cacheKey = `auth:w:${authHeader}:${dopath}`;
    
    // 尝试从 KV 读缓存
    try {
        const cached = await context.env.CACHE?.get(cacheKey);
        if(cached !== null) return cached === 'true';
    } catch(e) {}
    
    // 执行权限检查
    const result = checkAuthPermission(context, dopath);
    
    // 缓存 30 分钟
    try {
        await context.env.CACHE?.put(cacheKey, String(result), { expirationTtl: 1800 });
    } catch(e) {}
    
    return result;
}

/**
 * 检查用户是否有权限读取指定路径（带缓存）
 * 优先级：游客权限 > 认证用户权限 > 系统文件权限
 */
export async function get_auth_status_for_read(context, filePath) {
    const authHeader = context.request.headers.get('Authorization') || 'guest';
    const cacheKey = `auth:r:${authHeader}:${filePath}`;
    
    // 尝试从 KV 读缓存
    try {
        const cached = await context.env.CACHE?.get(cacheKey);
        if(cached !== null) return cached === 'true';
    } catch(e) {}
    
    let result = false;
    
    // 1. 游客权限（最优先，不需要认证）
    if (context.env["GUEST"] && !filePath.startsWith("_$flaredrive$/")) {
        const allow_guest = context.env["GUEST"].split(",").map(p => p.trim());
        result = allow_guest.some(p => p === "*" || filePath.startsWith(p));
        if(result) {
            // 缓存成功的游客访问
            try {
                await context.env.CACHE?.put(cacheKey, 'true', { expirationTtl: 1800 });
            } catch(e) {}
            return true;
        }
    }
    
    // 2. 认证用户权限
    result = await check_user_permission(context, filePath);
    
    // 缓存结果
    try {
        await context.env.CACHE?.put(cacheKey, String(result), { expirationTtl: 1800 });
    } catch(e) {}
    
    return result;
}

/**
 * 检查认证用户的权限
 */
async function check_user_permission(context, filePath) {
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader) return false;
    
    try {
        const account = atob(authHeader.split("Basic ")[1]);
        if (!account || !context.env[account]) return false;
        
        const allow = context.env[account].split(",");
        return allow.some(p => p === "*" || filePath.startsWith(p));
    } catch(e) {
        return false;
    }
}

  