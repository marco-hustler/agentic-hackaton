"""Provider-agnostic LLM client wrapper.

Supports ANY provider via LiteLLM (`LLM_MODEL=gemini/...`, `openai/...`, `anthropic/...`)
or any OpenAI-compatible HTTP endpoint (`LLM_API_BASE` + `LLM_API_KEY`, e.g. Nebius).
If no model/key is configured, cleanly reports `is_configured == False` so callers
fall back to deterministic logic without ever crashing a demo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


@dataclass
class LLMConfig:
    model: str | None = None
    api_key: str | None = None
    api_base: str | None = None
    timeout_seconds: float = 20.0

    @classmethod
    def from_env(cls) -> "LLMConfig":
        model = (os.getenv("LLM_MODEL") or "").strip() or None
        api_key = (
            os.getenv("LLM_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("ANTHROPIC_API_KEY")
            or ""
        ).strip() or None
        api_base = (os.getenv("LLM_API_BASE") or "").strip() or None
        return cls(model=model, api_key=api_key, api_base=api_base)

    @classmethod
    def from_headers(cls, headers: dict[str, str] | None) -> "LLMConfig | None":
        """Build config from browser-session headers when both model and key are present."""
        if not headers:
            return None
        lower = {str(k).lower(): str(v) for k, v in headers.items()}
        model = (lower.get("x-llm-model") or "").strip() or None
        api_key = (lower.get("x-llm-api-key") or "").strip() or None
        api_base = (lower.get("x-llm-api-base") or "").strip() or None
        if not (model and api_key):
            return None
        return cls(model=model, api_key=api_key, api_base=api_base)

    @classmethod
    def resolve(cls, headers: dict[str, str] | None = None) -> "LLMConfig":
        """Prefer per-request session headers; fall back to server env (e.g. Vercel)."""
        from_session = cls.from_headers(headers)
        if from_session is not None:
            return from_session
        return cls.from_env()

    @property
    def is_configured(self) -> bool:
        return bool(self.model and self.api_key)


class AgnosticLLMClient:
    """Thin provider-agnostic chat completion interface."""

    def __init__(self, config: LLMConfig | None = None) -> None:
        self.config = config or LLMConfig.from_env()

    @property
    def is_configured(self) -> bool:
        return self.config.is_configured

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> str | None:
        """Return assistant text, or None if unconfigured or unavailable."""
        if not self.is_configured or not self.config.model:
            return None

        # Path 1: LiteLLM if installed (covers Gemini, OpenAI, Anthropic, Nebius, Ollama, etc.)
        try:
            import litellm  # type: ignore[import-not-found]

            kwargs: dict = {
                "model": self.config.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "timeout": self.config.timeout_seconds,
            }
            if self.config.api_key:
                kwargs["api_key"] = self.config.api_key
            if self.config.api_base:
                kwargs["api_base"] = self.config.api_base
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            resp = await litellm.acompletion(**kwargs)
            return resp.choices[0].message.content  # type: ignore[union-attr]
        except ImportError:
            pass
        except Exception:
            return None

        # Path 2: Direct OpenAI-compatible HTTP fallback (zero extra packages required).
        if not self.config.api_base and not self.config.model.startswith("openai/"):
            return None

        base = (self.config.api_base or "https://api.openai.com/v1").rstrip("/")
        model_name = self.config.model.removeprefix("openai/")
        payload: dict = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
                res = await client.post(
                    f"{base}/chat/completions",
                    headers={"Authorization": f"Bearer {self.config.api_key}"},
                    json=payload,
                )
                res.raise_for_status()
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception:
            return None
