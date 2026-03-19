import { notFound, parseBucketPath } from "@/utils/bucket";
import { get_auth_status_for_read } from "@/utils/auth";

function getCacheControl(path: string, size: number): string {
  // 缩略图：30 天（很少变化）
  if (path.startsWith("_$flaredrive$/thumbnails/")) return "public, max-age=2592000";
  
  // 小文件（< 1MB）：1 小时
  if (size < 1024 * 1024) return "public, max-age=3600";
  
  // 大文件：15 分钟（降低缓存时间，文件可能被更新）
  return "public, max-age=900";
}

export async function onRequestGet(context) {
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  // 权限检查
  const hasPermission = await get_auth_status_for_read(context, path);
  if (!hasPermission) {
    return new Response("Unauthorized", { 
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Please login"' }
    });
  }

  try {
    const object = await bucket.get(path);
    if (!object) return notFound();

    const headers = new Headers();
    const fileSize = object.size;
    const etag = object.httpEtag || `"${object.size}-${object.uploaded}"`

    // 设置缓存和 ETag
    headers.set("Cache-Control", getCacheControl(path, fileSize));
    headers.set("ETag", etag);
    headers.set("Accept-Ranges", "bytes");
    
    // 检查 ETag 缓存（304 Not Modified）
    if (context.request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    
    // Content-Type
    if (object.httpMetadata?.contentType) {
      headers.set("Content-Type", object.httpMetadata.contentType);
    }
    
    // 支持 Range 请求（断点续传）
    const rangeHeader = context.request.headers.get("Range");
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const range = rangeHeader.substring(6);
      const parts = range.split("-");
      const start = parseInt(parts[0]) || 0;
      const end = parts[1] ? parseInt(parts[1]) : fileSize - 1;
      
      if (start >= 0 && end < fileSize && start <= end) {
        headers.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        headers.set("Content-Length", String(end - start + 1));
        
        // 返回指定范围（简化版：返回整个文件，浏览器会处理）
        return new Response(object.body, { status: 206, headers });
      }
    }
    
    // 普通下载
    headers.set("Content-Length", String(fileSize));
    const filename = path.split("/").pop();
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    headers.set("Vary", "Accept-Encoding");

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error("Error reading from R2:", error);
    return new Response("Server Error", { status: 500 });
  }
}