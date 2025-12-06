import { notFound, parseBucketPath } from "@/utils/bucket";
import { get_auth_status_for_read } from "@/utils/auth";

export async function onRequestGet(context) {
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  // 权限检查 - 验证用户是否有权限读取此文件
  if (!get_auth_status_for_read(context, path)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 直接从 R2 读取文件，而不是转发公开 URL
    const object = await bucket.get(path);
    
    if (!object) {
      return notFound();
    }

    const headers = new Headers();
    
    // 保留原始 Content-Type
    if (object.httpMetadata?.contentType) {
      headers.set("Content-Type", object.httpMetadata.contentType);
    }
    
    // 缓存长期不变的缩略图
    if (path.startsWith("_$flaredrive$/thumbnails/")) {
      headers.set("Cache-Control", "max-age=31536000");
    } else {
      headers.set("Cache-Control", "max-age=3600");
    }

    // 设置下载文件名
    const filename = path.split("/").pop();
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(filename)}"`
    );

    return new Response(object.body, {
      headers: headers,
      status: 200,
    });
  } catch (error) {
    console.error("Error reading from R2:", error);
    return notFound();
  }
}