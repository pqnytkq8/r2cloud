/**
 * S3 API 兼容路由
 * 在 Workers 中，直接使用 R2 Bucket 对象而不是 S3 API
 */

export async function onRequest(context: any) {
  try {
    const { request, env } = context;
    
    // 返回不支持的消息（S3 API 路由在 Workers 中不需要）
    return new Response(
      JSON.stringify({
        error: "S3 API route not needed in Workers deployment",
        message: "Use /api/write/items/ instead",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

