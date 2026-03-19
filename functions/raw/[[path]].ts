import { notFound, parseBucketPath } from "@/utils/bucket";
import { get_auth_status_for_read } from "@/utils/auth";

function createPipedResponse(context, body: ReadableStream | null, init: ResponseInit) {
  if (!body) return new Response(null, init);

  const { readable, writable } = new TransformStream();
  const pipePromise = body.pipeTo(writable).catch((error) => {
    try {
      writable.abort(error);
    } catch (_e) {}
  });

  if (typeof context?.waitUntil === "function") {
    context.waitUntil(pipePromise);
  }

  return new Response(readable, init);
}

function parseRangeHeader(rangeHeader: string, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const value = rangeHeader.slice(6).trim();
  if (!value || value.includes(",")) return "invalid";

  const [startStr, endStr] = value.split("-");
  let start = startStr === "" ? NaN : Number(startStr);
  let end = endStr === "" ? NaN : Number(endStr);

  if (Number.isNaN(start)) {
    // bytes=-N
    if (Number.isNaN(end) || end <= 0) return "invalid";
    const length = Math.min(end, size);
    start = size - length;
    end = size - 1;
  } else {
    // bytes=N- or bytes=N-M
    if (Number.isNaN(end)) {
      end = size - 1;
    }
  }

  if (start < 0 || end < start || start >= size) return "invalid";
  if (end >= size) end = size - 1;

  return {
    start,
    end,
    offset: start,
    length: end - start + 1,
  };
}

function buildCacheControl(path: string) {
  if (path.startsWith("_$flaredrive$/thumbnails/")) {
    return "public, max-age=31536000, immutable";
  }
  return "private, max-age=60, must-revalidate";
}

export async function onRequestGet(context) {
  const request: Request = context.request;
  const url = new URL(request.url);
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  // 权限检查 - 验证用户是否有权限读取此文件
  if (!get_auth_status_for_read(context, path)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rangeHeader = request.headers.get("Range");
    const cacheControl = buildCacheControl(path);

    // 常规下载：只发一次 R2 请求，减少起速延迟
    if (!rangeHeader) {
      const object = await bucket.get(path);
      if (!object) return notFound();

      const etag = object.httpEtag;
      const lastModified = object.uploaded
        ? new Date(object.uploaded).toUTCString()
        : null;
      const ifNoneMatch = request.headers.get("If-None-Match");
      if (
        etag &&
        ifNoneMatch &&
        ifNoneMatch
          .split(",")
          .map((v) => v.trim())
          .includes(etag)
      ) {
        const notModifiedHeaders = new Headers();
        notModifiedHeaders.set("Cache-Control", cacheControl);
        notModifiedHeaders.set("Accept-Ranges", "bytes");
        notModifiedHeaders.set("ETag", etag);
        if (lastModified) notModifiedHeaders.set("Last-Modified", lastModified);
        return new Response(null, { status: 304, headers: notModifiedHeaders });
      }

      const headers = new Headers();
      const contentType = object.httpMetadata?.contentType;
      if (contentType) headers.set("Content-Type", contentType);

      headers.set("Cache-Control", cacheControl);
      headers.set("Accept-Ranges", "bytes");
      if (etag) headers.set("ETag", etag);
      if (lastModified) headers.set("Last-Modified", lastModified);

      const filename = path.split("/").pop() || "download";
      const encodedFilename = encodeURIComponent(filename);
      const isDownload = url.searchParams.get("download") === "1";
      headers.set(
        "Content-Disposition",
        `${isDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodedFilename}`
      );

      if (typeof object.size === "number") {
        headers.set("Content-Length", String(object.size));
      }

      return createPipedResponse(context, object.body, {
        headers,
        status: 200,
      });
    }

    // Range 下载：需要 size，才查询 head
    const head = await bucket.head(path);
    if (!head) return notFound();
    const size = Number(head.size || 0);
    const parsedRange = parseRangeHeader(rangeHeader, size);
    if (parsedRange === "invalid") {
      const invalidHeaders = new Headers();
      invalidHeaders.set("Content-Range", `bytes */${size}`);
      return new Response("Invalid Range", { status: 416, headers: invalidHeaders });
    }

    const object = await bucket.get(path, {
          range: {
            offset: parsedRange.offset,
            length: parsedRange.length,
          },
        });

    if (!object) return notFound();

    const headers = new Headers();

    // 保留原始 Content-Type
    const contentType = object.httpMetadata?.contentType || head.httpMetadata?.contentType;
    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    const etag = object.httpEtag || head.httpEtag;
    const lastModified = (object.uploaded || head.uploaded)
      ? new Date(object.uploaded || head.uploaded).toUTCString()
      : null;

    headers.set("Cache-Control", cacheControl);
    headers.set("Accept-Ranges", "bytes");
    if (etag) headers.set("ETag", etag);
    if (lastModified) headers.set("Last-Modified", lastModified);

    const filename = path.split("/").pop() || "download";
    const encodedFilename = encodeURIComponent(filename);
    const isDownload = url.searchParams.get("download") === "1";
    headers.set(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodedFilename}`
    );

    headers.set(
      "Content-Range",
      `bytes ${parsedRange.start}-${parsedRange.end}/${size}`
    );
    headers.set("Content-Length", String(parsedRange.length));

    return createPipedResponse(context, object.body, {
      headers: headers,
      status: 206,
    });
  } catch (error) {
    console.error("Error reading from R2:", error);
    return new Response(
      JSON.stringify({
        error: "ReadFailed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}