function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function buildSearchParams(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item == null) continue;
        params.append(key, String(item));
      }
      continue;
    }

    params.append(key, String(value));
  }

  return params;
}

function appendQueryToUrl(url, query) {
  const base = new URL(url);
  const params = buildSearchParams(query);

  for (const [key, value] of params.entries()) {
    base.searchParams.append(key, value);
  }

  return base.toString();
}

function normalizeMethod(method = "GET") {
  return String(method || "GET").trim().toUpperCase();
}

function redactHeaders(headers = {}) {
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalizedKey = String(key || "").toLowerCase();
    const shouldRedact = ["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"].includes(normalizedKey);
    output[key] = shouldRedact ? "[REDACTED]" : value;
  }
  return output;
}

function prepareBody(method, body, headers) {
  if (body == null) {
    return { body: undefined, headers };
  }

  if (method === "GET" || method === "HEAD") {
    return { body: undefined, headers };
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return { body, headers };
  }

  if (body instanceof URLSearchParams) {
    const nextHeaders = new Headers(headers);
    if (!nextHeaders.has("content-type")) {
      nextHeaders.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
    return { body, headers: nextHeaders };
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof body === "string" || body instanceof Blob) {
    return { body, headers };
  }

  if (isPlainObject(body) || Array.isArray(body)) {
    const nextHeaders = new Headers(headers);
    if (!nextHeaders.has("content-type")) {
      nextHeaders.set("content-type", "application/json");
    }
    return { body: JSON.stringify(body), headers: nextHeaders };
  }

  return { body, headers };
}

async function parseResponse(response, responseType = "auto") {
  if (responseType === "response") return response;
  if (response.status === 204) return null;

  if (responseType === "arrayBuffer") {
    return response.arrayBuffer();
  }

  if (responseType === "text") {
    return response.text();
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (responseType === "json" || contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export class HttpClientError extends Error {
  constructor(message, { status = null, data = null, url = null, method = null, headers = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "HttpClientError";
    this.status = status;
    this.data = data;
    this.url = url;
    this.method = method;
    this.headers = headers;
  }
}

export function createHttpClient({ logger = console } = {}) {
  async function request({
    method = "GET",
    url,
    query = null,
    body = null,
    headers = {},
    timeout = 30000,
    responseType = "auto",
    moduleKey = null,
  }) {
    const finalMethod = normalizeMethod(method);
    const mergedQuery = { ...(query || {}) };

    if ((finalMethod === "GET" || finalMethod === "HEAD") && isPlainObject(body)) {
      Object.assign(mergedQuery, body);
      body = null;
    }

    const finalUrl = Object.keys(mergedQuery).length ? appendQueryToUrl(url, mergedQuery) : url;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);
    const requestHeaders = new Headers(headers || {});
    const prepared = prepareBody(finalMethod, body, requestHeaders);
    const startedAt = Date.now();

    logger?.debug?.(
      {
        moduleKey,
        method: finalMethod,
        url: finalUrl,
        headers: redactHeaders(Object.fromEntries(prepared.headers.entries())),
        timeout,
      },
      "http request started",
    );

    try {
      const response = await fetch(finalUrl, {
        method: finalMethod,
        headers: prepared.headers,
        body: prepared.body,
        signal: abortController.signal,
      });

      const parsed = await parseResponse(response, responseType);
      const durationMs = Date.now() - startedAt;

      logger?.debug?.(
        {
          moduleKey,
          method: finalMethod,
          url: finalUrl,
          status: response.status,
          durationMs,
        },
        "http request completed",
      );

      if (!response.ok) {
        throw new HttpClientError(`http_request_failed:${response.status}`, {
          status: response.status,
          data: parsed,
          url: finalUrl,
          method: finalMethod,
          headers: Object.fromEntries(response.headers.entries()),
        });
      }

      return parsed;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      if (err?.name === "AbortError") {
        logger?.warn?.({ moduleKey, method: finalMethod, url: finalUrl, durationMs, timeout }, "http request timed out");
        throw new HttpClientError("http_request_timeout", {
          url: finalUrl,
          method: finalMethod,
          cause: err,
        });
      }

      if (err instanceof HttpClientError) {
        logger?.warn?.({ moduleKey, method: finalMethod, url: finalUrl, status: err.status, durationMs }, "http request failed");
        throw err;
      }

      logger?.error?.({ err, moduleKey, method: finalMethod, url: finalUrl, durationMs }, "http request crashed");
      throw new HttpClientError("http_request_error", {
        url: finalUrl,
        method: finalMethod,
        cause: err,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    request,
    get(url, options = {}) {
      return request({ ...options, method: "GET", url });
    },
    post(url, options = {}) {
      return request({ ...options, method: "POST", url });
    },
    put(url, options = {}) {
      return request({ ...options, method: "PUT", url });
    },
    patch(url, options = {}) {
      return request({ ...options, method: "PATCH", url });
    },
    delete(url, options = {}) {
      return request({ ...options, method: "DELETE", url });
    },
  };
}
