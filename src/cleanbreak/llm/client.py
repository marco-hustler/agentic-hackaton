"""Provider-agnostic LLM client wrapper.

Supports:
1. LiteLLM (`LLM_MODEL=gemini/...`, `openai/...`, `anthropic/...`) when installed.
2. Direct native Google Gemini REST API (`gemini/...`) via httpx (zero extra packages).
3. Direct OpenAI-compatible HTTP endpoints (`LLM_API_BASE` + `LLM_API_KEY`, e.g. OpenAI, Nebius).

Comma-separated models in `LLM_MODEL` act as an automatic fallback chain (e.g. if one
Gemini variant returns a transient 503 during a live demo, the next is tried immediately).
If no model/key is configured, cleanly reports `is_configured == False` so callers
fall back to deterministic logic without ever crashing a demo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


@dataclass
class LLMConfig:
    model: str | None = None
    api_key: str | None = None
    api_base: str | None = None
    timeout_seconds: float = 15.0

    @classmethod
    def from_env(cls) -> "LLMConfig":
        model = (os.getenv("LLM_MODEL") or "").strip() or None
        api_key = (
            os.getenv("LLM_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("OPENAI_API_KEY")
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
        """Prefer server .env config; fall back to browser-session headers when env is unset."""
        from_env = cls.from_env()
        if from_env.is_configured:
            return from_env
        from_session = cls.from_headers(headers)
        if from_session is not None:
            return from_session
        return from_env

    @classmethod
    def resolve_with_source(cls, headers: dict[str, str] | None = None) -> tuple["LLMConfig", str | None]:
        """Return (config, 'env' | 'session' | None) with server env taking precedence."""
        from_env = cls.from_env()
        if from_env.is_configured:
            return from_env, "env"
        from_session = cls.from_headers(headers)
        if from_session is not None:
            return from_session, "session"
        return from_env, None

    @property
    def models(self) -> list[str]:
        if not self.model:
            return []
        return [m.strip() for m in self.model.split(",") if m.strip()]

    @property
    def is_configured(self) -> bool:
        return bool(self.models and self.api_key)


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
        if not self.is_configured:
            return None

        for model_spec in self.config.models:
            result = await self._complete_single(
                model_spec,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_mode=json_mode,
                temperature=temperature,
            )
            if result:
                return result
        return None

    async def _complete_single(
        self,
        model_spec: str,
        *,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool,
        temperature: float,
    ) -> str | None:
        # Path 1: LiteLLM if installed (covers Gemini, OpenAI, Anthropic, Nebius, Ollama, etc.)
        try:
            import litellm  # type: ignore[import-not-found]

            kwargs: dict = {
                "model": model_spec,
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
            content = resp.choices[0].message.content  # type: ignore[union-attr]
            if content:
                return content
        except ImportError:
            pass
        except Exception:
            pass

        # Path 2: Native Google Gemini REST API (zero extra packages, fast & reliable).
        if not self.config.api_base and model_spec.startswith("gemini/"):
            return await self._complete_gemini_native(
                model_spec.removeprefix("gemini/"),
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_mode=json_mode,
                temperature=temperature,
            )

        # Path 3: Direct OpenAI-compatible HTTP fallback (OpenAI, Nebius, etc.).
        if not self.config.api_base and not model_spec.startswith("openai/"):
            return None

        base = (self.config.api_base or "https://api.openai.com/v1").rstrip("/")
        model_name = model_spec.removeprefix("openai/")
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

    async def _complete_gemini_native(
        self,
        model_name: str,
        *,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool,
        temperature: float,
    ) -> str | None:
        clean_model = model_name.removeprefix("models/")
        generation_config: dict = {"temperature": temperature}
        if json_mode:
            generation_config["responseMimeType"] = "application/json"

        payload: dict = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config,
        }

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
                res = await client.post(
                    f"{GEMINI_API_BASE}/models/{clean_model}:generateContent",
                    params={"key": self.config.api_key},
                    json=payload,
                )
                res.raise_for_status()
                data = res.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    return None
                parts = candidates[0].get("content", {}).get("parts") or []
                # Skip internal reasoning/thought parts if present; join visible text parts.
                texts = [
                    p["text"]
                    for p in parts
                    if isinstance(p, dict) and isinstance(p.get("text"), str) and not p.get("thought")
                ]
                return "".join(texts).strip() or None
        except Exception:
            return None
