const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  const requestOptions = {
    ...options,
  };

  const hasBody = requestOptions.body !== undefined && requestOptions.body !== null;
  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const contentType = headers["Content-Type"] || headers["content-type"] || "";
  const shouldSerializeJson =
    hasBody &&
    typeof requestOptions.body !== "string" &&
    !(requestOptions.body instanceof FormData) &&
    contentType.includes("application/json");

  if (shouldSerializeJson) {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    ...requestOptions,
    headers,
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const message = body?.error || response.statusText || "request_failed";
    const err = new Error(message);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return body;
}
