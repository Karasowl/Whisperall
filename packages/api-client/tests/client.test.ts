import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { ApiClient } from "../src/client";

const BASE = "http://localhost:8080";

describe("ApiClient", () => {
  it("postJson sends JSON with auth header", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown;

    server.use(
      http.post(`${BASE}/v1/test`, async ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    const client = new ApiClient({ baseUrl: BASE, token: "tk-123" });
    const res = await client.postJson<{ ok: boolean }>("/v1/test", { foo: "bar" });

    expect(res.ok).toBe(true);
    expect(capturedHeaders.authorization).toBe("Bearer tk-123");
    expect(capturedHeaders["content-type"]).toContain("application/json");
    expect(capturedBody).toEqual({ foo: "bar" });
  });

  it("get sends GET with auth header", async () => {
    let capturedMethod = "";
    server.use(
      http.get(`${BASE}/v1/data`, ({ request }) => {
        capturedMethod = request.method;
        return HttpResponse.json({ value: 42 });
      })
    );

    const client = new ApiClient({ baseUrl: BASE, token: "tk-456" });
    const res = await client.get<{ value: number }>("/v1/data");

    expect(res.value).toBe(42);
    expect(capturedMethod).toBe("GET");
  });

  it("throws on non-ok response", async () => {
    server.use(
      http.post(`${BASE}/v1/fail`, () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    const client = new ApiClient({ baseUrl: BASE });
    await expect(client.postJson("/v1/fail", {})).rejects.toThrow("API error: 500");
  });

  it("setToken updates auth header", async () => {
    let authHeader = "";
    server.use(
      http.get(`${BASE}/v1/check`, ({ request }) => {
        authHeader = request.headers.get("authorization") ?? "";
        return HttpResponse.json({});
      })
    );

    const client = new ApiClient({ baseUrl: BASE });
    client.setToken("new-token");
    await client.get("/v1/check");

    expect(authHeader).toBe("Bearer new-token");
  });

  it("postFormData throws on non-ok response", async () => {
    server.use(
      http.post(`${BASE}/v1/upload`, () => {
        return new HttpResponse(null, { status: 413 });
      })
    );

    const client = new ApiClient({ baseUrl: BASE });
    const form = new FormData();
    await expect(client.postFormData("/v1/upload", form)).rejects.toThrow("API error: 413");
  });

  it("get throws on non-ok response", async () => {
    server.use(
      http.get(`${BASE}/v1/missing`, () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

    const client = new ApiClient({ baseUrl: BASE });
    await expect(client.get("/v1/missing")).rejects.toThrow("API error: 404");
  });
});
