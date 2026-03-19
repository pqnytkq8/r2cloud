/**
 * 中间件：处理所有请求路由
 * 支持 Cloudflare Workers 和 Pages 部署
 */

// 导入所有路由处理器
import * as apiChildren from "./api/children/[[path]]";
import * as apiWrite from "./api/write/items/[[path]]";
import * as apiWriteS3 from "./api/write/s3/[[path]]";
import * as apiTest from "./api/write/test/[[path]]";
import * as apiBuckets from "./api/buckets";
import * as rawFile from "./raw/[[path]]";

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    // API 路由处理
    if (pathname.startsWith("/api/buckets")) {
      return await apiBuckets.onRequestGet?.({
        request,
        env,
        params: {},
      });
    }

    if (pathname.startsWith("/api/children/")) {
      const path = pathname.replace("/api/children/", "");
      const pathParams = path ? path.split("/").filter(Boolean) : [];
      return await apiChildren.onRequestGet?.({
        request,
        env,
        params: { path: pathParams },
      });
    }

    if (pathname.startsWith("/api/write/items/")) {
      const path = pathname.replace("/api/write/items/", "");
      const pathParams = path ? path.split("/").filter(Boolean) : [];
      
      // 根据 HTTP 方法调用对应的处理器
      if (request.method === "PUT") {
        return await apiWrite.onRequestPut?.({
          request,
          env,
          params: { path: pathParams },
        });
      } else if (request.method === "POST") {
        return await apiWrite.onRequestPost?.({
          request,
          env,
          params: { path: pathParams },
        });
      } else if (request.method === "DELETE") {
        return await apiWrite.onRequestDelete?.({
          request,
          env,
          params: { path: pathParams },
        });
      }
    }

    if (pathname.startsWith("/api/write/s3/")) {
      const path = pathname.replace("/api/write/s3/", "");
      const pathParams = path ? path.split("/").filter(Boolean) : [];
      return await (apiWriteS3 as any).onRequest?.({
        request,
        env,
        params: { path: pathParams },
      });
    }

    if (pathname.startsWith("/api/write/test/")) {
      const path = pathname.replace("/api/write/test/", "");
      const pathParams = path ? path.split("/").filter(Boolean) : [];
      return await (apiTest as any).onRequest?.({
        request,
        env,
        params: { path: pathParams },
      });
    }

    // 原始文件访问路由
    if (pathname.startsWith("/raw/")) {
      const path = pathname.replace("/raw/", "");
      const pathParams = path ? path.split("/").filter(Boolean) : [];
      return await rawFile.onRequestGet?.({
        request,
        env,
        params: { path: pathParams },
      });
    }

    // 默认处理：静态文件或 SPA 路由
    // 让 Workers 处理静态文件（index.html、assets 等）
    // 如果是 API 路由但不在上面匹配，返回 404
    if (pathname.startsWith("/") && !pathname.startsWith("/api/") && !pathname.startsWith("/raw/")) {
      // 这是一个潜在的静态文件或 SPA 路由
      // 直接由 Workers 的静态文件服务器处理
      return context.next?.() || new Response("Not found", { status: 404 });
    }

    // 其他未知请求返回 404
    return new Response("Not found", { status: 404 });
  } catch (error: any) {
    console.error("Middleware error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}


