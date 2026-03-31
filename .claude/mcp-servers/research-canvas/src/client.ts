const BASE = "http://127.0.0.1:9876";

export class CanvasApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CanvasApiError";
  }
}

export async function apiCall<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CanvasApiError(
      0,
      "Canvas app is not running. Start the app and open a canvas first.",
    );
  }

  const json = (await response.json()) as { ok?: boolean; error?: string } & T;

  if (!response.ok) {
    throw new CanvasApiError(
      response.status,
      (json as { error?: string }).error ?? `HTTP ${response.status}`,
    );
  }

  return json;
}
