export type ApiClientOptions = {
  baseUrl: string;
  token?: string;
  tokenProvider?: () => string | undefined | Promise<string | undefined>;
};

export class ApiError extends Error {
  status: number;
  code: string;
  resource?: string;
  /**
   * Optional pipeline stage where the error was raised. Populated by the
   * `X-Whisperall-Error-Stage` response header on endpoints that instrument
   * themselves (currently: `POST /v1/transcribe/from-url`). Lets the client
   * show "Failed at: download" instead of a generic error string so the user
   * can tell where in a multi-step pipeline the failure happened.
   */
  stage?: string;

  constructor(status: number, detail: string, code: string, resource?: string, stage?: string) {
    super(`API error ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.resource = resource;
    this.stage = stage;
  }
}

export type RequestOpts = { signal?: AbortSignal };

export class ApiClient {
  private baseUrl: string;
  private token?: string;
  private tokenProvider?: () => string | undefined | Promise<string | undefined>;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.tokenProvider = opts.tokenProvider;
  }

  setToken(token?: string) {
    this.token = token;
  }

  private async authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    if (this.tokenProvider) {
      const provided = await this.tokenProvider();
      this.token = provided;
    }
    const headers: Record<string, string> = { ...extra };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async throwWithBody(res: Response): Promise<never> {
    let detail = "";
    let code = "";
    let resource: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
      code = body.error?.code ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    resource = res.headers.get("X-Whisperall-Resource") ?? undefined;
    if (!code) code = res.headers.get("X-Whisperall-Error-Code") ?? "";
    const stage = res.headers.get("X-Whisperall-Error-Stage") ?? undefined;
    throw new ApiError(res.status, detail, code, resource, stage);
  }

  async postJson<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: await this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    if (!res.ok) {
      await this.throwWithBody(res);
    }
    return res.json() as Promise<T>;
  }

  async postFormData<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: await this.authHeaders(),
      body: form,
    });
    if (!res.ok) {
      await this.throwWithBody(res);
    }
    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: await this.authHeaders(),
    });
    if (!res.ok) {
      await this.throwWithBody(res);
    }
    return res.json() as Promise<T>;
  }

  async putJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: await this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      await this.throwWithBody(res);
    }
    return res.json() as Promise<T>;
  }

  async patchJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: await this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      await this.throwWithBody(res);
    }
    return res.json() as Promise<T>;
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: await this.authHeaders(),
    });
    if (!res.ok) {
      await this.throwWithBody(res);
    }
  }
}
