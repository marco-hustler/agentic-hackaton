"""File-backed OAuth token storage and local loopback callback server for idealo MCP."""

from __future__ import annotations

import asyncio
import http.server
import json
import os
import threading
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from mcp.client.auth import AuthorizationCodeResult, OAuthClientProvider, TokenStorage
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken
from pydantic import AnyUrl


class FileTokenStorage(TokenStorage):
    """Persists OAuth tokens and dynamically registered client info to a local JSON file."""

    def __init__(self, token_file: str | Path = ".idealo_tokens.json") -> None:
        self.token_file = Path(token_file)

    def _read(self) -> dict:
        if not self.token_file.exists():
            return {}
        try:
            return json.loads(self.token_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def _write(self, data: dict) -> None:
        self.token_file.parent.mkdir(parents=True, exist_ok=True)
        self.token_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        try:
            os.chmod(self.token_file, 0o600)
        except OSError:
            pass

    async def get_tokens(self) -> OAuthToken | None:
        raw = self._read().get("tokens")
        return OAuthToken.model_validate(raw) if raw else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        data = self._read()
        data["tokens"] = tokens.model_dump(mode="json")
        self._write(data)

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        raw = self._read().get("client_info")
        return OAuthClientInformationFull.model_validate(raw) if raw else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        data = self._read()
        data["client_info"] = client_info.model_dump(mode="json")
        self._write(data)


class LoopbackCallbackCatcher:
    """Runs a temporary local HTTP server to catch the OAuth redirect cleanly."""

    def __init__(self, port: int = 6274, path: str = "/callback", manual: bool = False) -> None:
        self.port = port
        self.path = path
        self.manual = manual

    @property
    def redirect_uri(self) -> str:
        return f"http://localhost:{self.port}{self.path}"

    async def redirect_handler(self, authorization_url: str) -> None:
        print("\n" + "=" * 72)
        print("idealo MCP OAuth login required.")
        print(f"Opening browser to:\n  {authorization_url}")
        print("(If the browser does not open automatically, copy-paste the URL above.)")
        print("=" * 72 + "\n", flush=True)
        try:
            webbrowser.open(authorization_url)
        except Exception:
            pass

    async def callback_handler(self) -> AuthorizationCodeResult:
        if self.manual:
            redirect_url = await asyncio.to_thread(
                input, "Paste the full redirected http://localhost:... URL here: "
            )
            return _parse_callback_url(redirect_url.strip())

        loop = asyncio.get_running_loop()
        result_future: asyncio.Future[AuthorizationCodeResult] = loop.create_future()
        expected_path = self.path

        class _Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                if parsed.path != expected_path:
                    self.send_response(404)
                    self.end_headers()
                    return

                params = parse_qs(parsed.query)
                if "error" in params:
                    err = params["error"][0]
                    desc = params.get("error_description", [""])[0]
                    self._send_html(f"<h2>OAuth failed: {err}</h2><p>{desc}</p>", status=400)
                    if not result_future.done():
                        loop.call_soon_threadsafe(
                            result_future.set_exception,
                            RuntimeError(f"OAuth error: {err} ({desc})"),
                        )
                    return

                if "code" not in params:
                    self._send_html("<h2>Missing authorization code.</h2>", status=400)
                    return

                auth_res = AuthorizationCodeResult(
                    code=params["code"][0],
                    state=params["state"][0] if "state" in params else None,
                    iss=params["iss"][0] if "iss" in params else None,
                )
                self._send_html(
                    "<h2>idealo MCP authentication succeeded!</h2>"
                    "<p>You can close this browser tab and return to your terminal.</p>"
                )
                if not result_future.done():
                    loop.call_soon_threadsafe(result_future.set_result, auth_res)

            def _send_html(self, body: str, status: int = 200) -> None:
                html = f"<!doctype html><html><body style='font-family:sans-serif;padding:2rem'>{body}</body></html>"
                encoded = html.encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, format: str, *args: object) -> None:  # noqa: A002
                return

        server = http.server.HTTPServer(("127.0.0.1", self.port), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f"Waiting for OAuth redirect on {self.redirect_uri} ...", flush=True)
        try:
            return await asyncio.wait_for(result_future, timeout=300.0)
        finally:
            server.shutdown()
            server.server_close()


def _parse_callback_url(url: str) -> AuthorizationCodeResult:
    params = parse_qs(urlparse(url).query)
    if "code" not in params:
        raise ValueError(f"No 'code' query parameter found in callback URL: {url}")
    return AuthorizationCodeResult(
        code=params["code"][0],
        state=params["state"][0] if "state" in params else None,
        iss=params["iss"][0] if "iss" in params else None,
    )


def build_oauth_provider(
    *,
    server_url: str = "https://mcp.idealo.com/mcp",
    token_file: str | Path = ".idealo_tokens.json",
    callback_port: int = 6274,
    manual_callback: bool = False,
) -> OAuthClientProvider:
    """Create a configured MCP v2 OAuthClientProvider with persisted token storage."""
    catcher = LoopbackCallbackCatcher(port=callback_port, manual=manual_callback)
    metadata = OAuthClientMetadata(
        client_name="CleanBreak Hackathon Client",
        redirect_uris=[AnyUrl(catcher.redirect_uri)],
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
    )
    return OAuthClientProvider(
        server_url=server_url,
        client_metadata=metadata,
        storage=FileTokenStorage(token_file),
        redirect_handler=catcher.redirect_handler,
        callback_handler=catcher.callback_handler,
    )
