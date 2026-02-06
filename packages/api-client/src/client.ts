export type ApiClientOptions = {
  baseUrl: string;
  token?: string;
};

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
  }

  setToken(token?: string) {
    this.token = token;
  }

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async postFormData<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}
