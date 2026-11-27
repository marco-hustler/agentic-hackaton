"""Hardcoded deploy secrets — paste values here for the hackathon build.

Priority: values in this file win over .env / environment variables.
Leave a field empty ("") to fall back to the environment.

Where to put the idealo OAuth dump:
  src/cleanbreak/assets/idealo.json
  (copy the contents of your local .idealo_tokens.json into that file)
"""

from __future__ import annotations

# =============================================================================
# PASTE YOUR KEYS HERE
# =============================================================================

# LLM — examples:
#   LLM_MODEL = "gemini/gemini-2.5-flash"
#   LLM_API_KEY = "AIza..."
#   LLM_API_BASE = ""                          # leave empty for Gemini/OpenAI/Anthropic via LiteLLM
#
#   LLM_MODEL = "openai/gpt-4o-mini"
#   LLM_API_KEY = "sk-..."
#
#   LLM_MODEL = "openai/meta-llama/Meta-Llama-3.1-70B-Instruct"
#   LLM_API_KEY = "..."
#   LLM_API_BASE = "https://api.studio.nebius.com/v1/"
LLM_MODEL = ""
LLM_API_KEY = ""
LLM_API_BASE = ""

# Idealo MCP OAuth token JSON lives next to this package:
#   src/cleanbreak/assets/idealo.json
# No token string here — drop the full .idealo_tokens.json payload into that file.
# =============================================================================
