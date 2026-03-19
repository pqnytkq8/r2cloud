import { notFound } from "@/utils/bucket";

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // 检查是否要获取当前存储桶
    if (url.searchParams.has("current")) {
      // 返回一个默认的存储桶名称
      return new Response("BUCKET", {
        headers: { "cache-control": "max-age=604800" },
      });
    }

    // 返回存储桶列表（简化版）
    return new Response(
      JSON.stringify({
        buckets: [
          {
            name: env.BUCKET ? "BUCKET" : "default",
            creationDate: new Date().toISOString(),
          },
        ],
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(e.toString(), { status: 500 });
  }
}

