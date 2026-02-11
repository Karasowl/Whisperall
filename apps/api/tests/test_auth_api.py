import jwt

JWT_SECRET = "test-secret"


def test_usage_requires_bearer_token(client):
    res = client.get("/v1/usage")
    assert res.status_code == 401
    assert res.json()["detail"] == "Missing bearer token"
    assert "bearer" in res.headers.get("www-authenticate", "").lower()
    assert 'error="invalid_request"' in res.headers.get("www-authenticate", "")


def test_usage_rejects_invalid_token(client):
    res = client.get("/v1/usage", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid or expired token"
    assert 'error="invalid_token"' in res.headers.get("www-authenticate", "")


def test_usage_rejects_expired_token(client):
    expired = jwt.encode({"sub": "user-123", "exp": 0}, JWT_SECRET, algorithm="HS256")
    res = client.get("/v1/usage", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid or expired token"
    assert 'error="invalid_token"' in res.headers.get("www-authenticate", "")
