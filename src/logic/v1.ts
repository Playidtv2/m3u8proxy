
export const M3u8ProxyV1 = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // ค่าเริ่มต้น
  const refererUrl =
    url.searchParams.get("referer") || "http://kserietv.com/";

  const targetUrl =
    url.searchParams.get("url") ||
    "https://vdohls.com/ah_V7Dxl9-6fJ/playlist.m3u8";

  const originUrl =
    url.searchParams.get("origin") || "https://vdohls.com";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // อนุญาตเฉพาะ URL แบบ HTTP/HTTPS
  let target: URL;
  try {
    target = new URL(targetUrl);
    if (!["http:", "https:"].includes(target.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return new Response("Invalid URL", {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    const response = await fetch(target.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: {
        Referer: refererUrl,
        Origin: originUrl,
      },
      redirect: "follow",
    });

    const contentType =
      response.headers.get("Content-Type") || "";

    const isM3u8 =
      /\.m3u8(?:$|[?#])/i.test(target.toString()) ||
      contentType.includes("mpegurl");

    const headers = new Headers(corsHeaders);
    headers.set(
      "Content-Type",
      contentType || "application/vnd.apple.mpegurl"
    );

    if (!response.ok) {
      return new Response(
        request.method === "HEAD" ? null : `Upstream error: ${response.status}`,
        { status: response.status, headers }
      );
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        headers,
      });
    }

    if (isM3u8) {
      const playlist = await response.text();

      // แปลง URL ของ playlist, segment และ key
      const rewritten = playlist
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();

          if (!trimmed) return line;

          if (trimmed.startsWith("#")) {
            // รองรับ URI="..." ใน EXT-X-KEY และ EXT-X-MAP
            return line.replace(
              /URI="([^"]+)"/g,
              (_match, uri) => {
                const absolute = new URL(uri, target).toString();
                return `URI="${makeProxyUrl(absolute, url.origin, refererUrl, originUrl)}"`;
              }
            );
          }

          const absolute = new URL(trimmed, target).toString();
          return makeProxyUrl(
            absolute,
            url.origin,
            refererUrl,
            originUrl
          );
        })
        .join("\n");

      return new Response(rewritten, {
        status: response.status,
        headers,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response("Upstream request failed", {
      status: 502,
      headers: corsHeaders,
    });
  }
};

function makeProxyUrl(
  target: string,
  proxyOrigin: string,
  referer: string,
  origin: string
): string {
  const params = new URLSearchParams({
    url: target,
    referer,
    origin,
  });

  return `${proxyOrigin}/?${params.toString()}`;
}
