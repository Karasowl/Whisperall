def _preflight_headers(origin: str) -> dict[str, str]:
    return {
        "Origin": origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
    }


def test_cors_allows_localhost_origin_preflight(client):
    res = client.options("/v1/usage", headers=_preflight_headers("http://localhost:5173"))
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "authorization" in res.headers.get("access-control-allow-headers", "").lower()


def test_cors_allows_dynamic_localhost_port_preflight(client):
    origin = "http://127.0.0.1:55174"
    res = client.options("/v1/usage", headers=_preflight_headers(origin))
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == origin


def test_cors_blocks_unlisted_origin_preflight(client):
    res = client.options("/v1/usage", headers=_preflight_headers("https://evil.example.com"))
    assert res.status_code == 400
    assert res.headers.get("access-control-allow-origin") is None
