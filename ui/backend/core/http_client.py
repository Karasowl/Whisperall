"""Unified HTTP client with error handling, retry logic, and logging.

This module provides a standardized way to make HTTP requests to external APIs
with automatic retry, structured error handling, and consistent logging.
"""

import logging
from typing import Optional, Dict, Any, Union
from dataclasses import dataclass

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


class HTTPError(Exception):
    """Base HTTP error with details."""

    def __init__(
        self,
        status_code: int,
        provider: str,
        message: str,
        response_body: Optional[str] = None
    ):
        self.status_code = status_code
        self.provider = provider
        self.message = message
        self.response_body = response_body
        super().__init__(f"{provider} API error: HTTP {status_code} - {message}")


class AuthenticationError(HTTPError):
    """API key invalid, expired, or missing."""

    def __init__(self, provider: str, message: Optional[str] = None):
        super().__init__(
            401,
            provider,
            message or f"{provider} API key is invalid or not configured"
        )


class RateLimitError(HTTPError):
    """Rate limit exceeded."""

    def __init__(self, provider: str, retry_after: Optional[int] = None):
        self.retry_after = retry_after
        message = f"Rate limit exceeded"
        if retry_after:
            message += f". Retry after {retry_after}s"
        super().__init__(429, provider, message)


class ServerError(HTTPError):
    """Server-side error (5xx)."""

    def __init__(self, provider: str, status_code: int, message: Optional[str] = None):
        super().__init__(
            status_code,
            provider,
            message or f"Server error"
        )


@dataclass
class APIClientConfig:
    """Configuration for API client."""
    base_url: str
    provider_name: str
    timeout: int = 120
    max_retries: int = 3
    retry_backoff: float = 0.5
    retry_statuses: tuple = (429, 500, 502, 503, 504)


class APIClient:
    """
    Unified HTTP client for API providers.

    Features:
    - Automatic retry with exponential backoff for transient errors
    - Structured error handling with typed exceptions
    - Request/response logging
    - Rate limit handling with Retry-After support

    Example:
        config = APIClientConfig(
            base_url="https://api.openai.com",
            provider_name="OpenAI"
        )
        client = APIClient(config, {"Authorization": "Bearer sk-..."})
        response = client.post("/v1/chat/completions", json=payload)
    """

    def __init__(self, config: APIClientConfig, auth_header: Dict[str, str]):
        self.config = config
        self.auth_header = auth_header
        self._session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create session with retry strategy."""
        session = requests.Session()

        retry_strategy = Retry(
            total=self.config.max_retries,
            backoff_factor=self.config.retry_backoff,
            status_forcelist=self.config.retry_statuses,
            allowed_methods=["GET", "POST", "PUT", "DELETE"],
            raise_on_status=False  # We handle status codes manually
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        return session

    def _build_url(self, endpoint: str) -> str:
        """Build full URL from base and endpoint."""
        base = self.config.base_url.rstrip("/")
        endpoint = endpoint.lstrip("/")
        return f"{base}/{endpoint}"

    def _extract_error_message(self, response: requests.Response) -> str:
        """Extract error message from response."""
        try:
            error_body = response.json()
            # Try common error formats
            if "error" in error_body:
                error = error_body["error"]
                if isinstance(error, dict):
                    return error.get("message", str(error))
                return str(error)
            if "detail" in error_body:
                detail = error_body["detail"]
                if isinstance(detail, dict):
                    return detail.get("message", str(detail))
                return str(detail)
            if "message" in error_body:
                return error_body["message"]
            return str(error_body)
        except Exception:
            return response.text[:500] if response.text else "Unknown error"

    def _handle_error(self, response: requests.Response) -> None:
        """Convert HTTP errors to typed exceptions."""
        status = response.status_code

        if status == 401 or status == 403:
            raise AuthenticationError(
                self.config.provider_name,
                self._extract_error_message(response)
            )

        if status == 429:
            retry_after = response.headers.get("Retry-After")
            raise RateLimitError(
                self.config.provider_name,
                int(retry_after) if retry_after and retry_after.isdigit() else None
            )

        if status >= 500:
            raise ServerError(
                self.config.provider_name,
                status,
                self._extract_error_message(response)
            )

        if status >= 400:
            raise HTTPError(
                status,
                self.config.provider_name,
                self._extract_error_message(response),
                response.text
            )

    def request(
        self,
        method: str,
        endpoint: str,
        json: Optional[Dict] = None,
        data: Optional[Union[Dict, bytes]] = None,
        files: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        params: Optional[Dict] = None,
        timeout: Optional[int] = None,
        stream: bool = False
    ) -> requests.Response:
        """
        Make HTTP request with error handling.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (e.g., "/v1/chat/completions")
            json: JSON body (auto-serialized)
            data: Form data or raw bytes
            files: Files for multipart upload
            headers: Additional headers (merged with auth)
            params: Query parameters
            timeout: Override default timeout
            stream: Enable streaming response

        Returns:
            requests.Response object

        Raises:
            AuthenticationError: Invalid/missing API key
            RateLimitError: Rate limit exceeded
            ServerError: Server-side error (5xx)
            HTTPError: Other HTTP errors
        """
        url = self._build_url(endpoint)
        request_headers = {**self.auth_header, **(headers or {})}

        logger.debug(f"[{self.config.provider_name}] {method} {endpoint}")

        try:
            response = self._session.request(
                method=method,
                url=url,
                json=json,
                data=data,
                files=files,
                headers=request_headers,
                params=params,
                timeout=timeout or self.config.timeout,
                stream=stream
            )
        except requests.exceptions.Timeout:
            raise HTTPError(
                408,
                self.config.provider_name,
                f"Request timed out after {timeout or self.config.timeout}s"
            )
        except requests.exceptions.ConnectionError as e:
            raise HTTPError(
                0,
                self.config.provider_name,
                f"Connection failed: {str(e)}"
            )

        if response.status_code >= 400:
            self._handle_error(response)

        return response

    def post(self, endpoint: str, **kwargs) -> requests.Response:
        """Make POST request."""
        return self.request("POST", endpoint, **kwargs)

    def get(self, endpoint: str, **kwargs) -> requests.Response:
        """Make GET request."""
        return self.request("GET", endpoint, **kwargs)

    def put(self, endpoint: str, **kwargs) -> requests.Response:
        """Make PUT request."""
        return self.request("PUT", endpoint, **kwargs)

    def delete(self, endpoint: str, **kwargs) -> requests.Response:
        """Make DELETE request."""
        return self.request("DELETE", endpoint, **kwargs)
