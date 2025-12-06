/**
 * 检查用户是否有权限写入指定路径
 */
export function get_auth_status(context) {
    var dopath = context.request.url.split("/api/write/items/")[1]
    if(context.env["GUEST"]){
        if(dopath.startsWith("_$flaredrive$/thumbnails/"))return true;
        const allow_guest = context.env["GUEST"].split(",")
        for (var aa of allow_guest){
            if(aa == "*"){
                return true
            }else if(dopath.startsWith(aa)){
                return true
            }
        }
    }
    var headers = new Headers(context.request.headers);
    if(!headers.get('Authorization'))return false
    const Authorization=headers.get('Authorization').split("Basic ")[1]
    const account = atob(Authorization);
    if(!account)return false
    if(!context.env[account])return false
    if(dopath.startsWith("_$flaredrive$/thumbnails/"))return true;
    const allow = context.env[account].split(",")
    for (var a of allow){
        if(a == "*"){
            return true
        }else if(dopath.startsWith(a)){
            return true
        }
    }
    return false;
}

/**
 * 检查用户是否有权限读取指定路径
 * 支持读取权限配置，若无读权限则需要写入权限代替
 */
export function get_auth_status_for_read(context, filePath) {
    // 系统文件总是允许读取（需要写入权限验证）
    if (filePath.startsWith("_$flaredrive$/")) {
        return check_user_permission(context, filePath);
    }

    // 游客可以读取 GUEST 目录下的文件
    if (context.env["GUEST"]) {
        const allow_guest = context.env["GUEST"].split(",");
        for (var path of allow_guest) {
            if (path === "*" || filePath.startsWith(path)) {
                return true;
            }
        }
    }

    // 已认证用户可以读取其有权限的目录下的文件
    return check_user_permission(context, filePath);
}

/**
 * 检查认证用户的权限
 */
function check_user_permission(context, filePath) {
    const headers = new Headers(context.request.headers);
    const authHeader = headers.get('Authorization');

    if (!authHeader) return false;

    try {
        const Authorization = authHeader.split("Basic ")[1];
        if (!Authorization) return false;

        const account = atob(Authorization);
        if (!account || !context.env[account]) return false;

        const allow = context.env[account].split(",");
        for (var path of allow) {
            if (path === "*" || filePath.startsWith(path)) {
                return true;
            }
        }
    } catch (error) {
        return false;
    }

    return false;
}

  