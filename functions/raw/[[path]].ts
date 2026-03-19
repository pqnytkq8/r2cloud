import { notFound, parseBucketPath } from "@/utils/bucket";
import { get_auth_status_for_read } from "@/utils/auth";

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
    const head = await bucket.head(path);
    if (!head) return notFound();

    const size = Number(head.size || 0);
    const etag = head.httpEtag;
    const lastModified = head.uploaded
      ? new Date(head.uploaded).toUTCString()
      : null;
    const cacheControl = buildCacheControl(path);

    const ifNoneMatch = request.headers.get("If-None-Match");
    if (etag && ifNoneMatch && ifNoneMatch.split(",").map((v) => v.trim()).includes(etag)) {
      const notModifiedHeaders = new Headers();
      notModifiedHeaders.set("Cache-Control", cacheControl);
      notModifiedHeaders.set("Accept-Ranges", "bytes");
      notModifiedHeaders.set("ETag", etag);
      if (lastModified) notModifiedHeaders.set("Last-Modified", lastModified);
      return new Response(null, { status: 304, headers: notModifiedHeaders });
    }

    const rangeHeader = request.headers.get("Range");
    const parsedRange = parseRangeHeader(rangeHeader, size);
    if (parsedRange === "invalid") {
      const invalidHeaders = new Headers();
      invalidHeaders.set("Content-Range", `bytes */${size}`);
      return new Response("Invalid Range", { status: 416, headers: invalidHeaders });
    }

    const object = parsedRange
      ? await bucket.get(path, {
          range: {
            offset: parsedRange.offset,
            length: parsedRange.length,
          },
        })
      : await bucket.get(path);

    if (!object) return notFound();

    const headers = new Headers();

    // 保留原始 Content-Type
    const contentType = object.httpMetadata?.contentType || head.httpMetadata?.contentType;
    if (contentType) {
      headers.set("Content-Type", contentType);
    }

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

    let status = 200;
    if (parsedRange) {
      status = 206;
      headers.set(
        "Content-Range",
        `bytes ${parsedRange.start}-${parsedRange.end}/${size}`
      );
      headers.set("Content-Length", String(parsedRange.length));
    } else if (typeof object.size === "number") {
      headers.set("Content-Length", String(object.size));
    }

    return new Response(object.body, {
      headers: headers,
      status,
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