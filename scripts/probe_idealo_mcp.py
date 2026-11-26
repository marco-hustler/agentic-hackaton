#!/usr/bin/env python3
"""Interactive idealo MCP OAuth & catalog probe script.

Usage:
  1. First verify OAuth + list exact MCP tool schemas (0 search calls):
       python scripts/probe_idealo_mcp.py --list-tools

  2. Probe all 7 Berlin WG demo items (~21 calls, automatically cached in data/cache/):
       python scripts/probe_idealo_mcp.py --probe-demo

  3. Probe a single custom product (~3 calls):
       python scripts/probe_idealo_mcp.py --query "Sage Barista Express" --country DE
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from dotenv import load_dotenv

from cleanbreak.idealo.client import IdealoMCPClient
from cleanbreak.models import HouseholdItemInput

REPO_ROOT = Path(__file__).resolve().parents[1]
DEMO_PATH = REPO_ROOT / "data" / "demo_berlin_wg.json"
TOOLS_OUT = REPO_ROOT / "data" / "idealo_tools_schema.json"
PROBE_OUT = REPO_ROOT / "data" / "probe_results.json"


async def run_probe(args: argparse.Namespace) -> None:
    load_dotenv()

    client = IdealoMCPClient(
        country=args.country,
        callback_port=args.callback_port,
        manual_callback=args.manual_callback,
    )

    async with client.connect():
        tools = await client.list_tools()
        TOOLS_OUT.write_text(json.dumps(tools, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nConnected to {client.server_url}!")
        print(f"Discovered {len(tools)} tools (saved full schema -> {TOOLS_OUT.relative_to(REPO_ROOT)}):")
        for t in tools:
            schema = t.get("input_schema") or t.get("inputSchema") or {}
            props = list(schema.get("properties", {}).keys())
            print(f"  - {t['name']}({', '.join(props)})")

        if args.list_tools and not args.probe_demo and not args.query:
            return

        queries: list[tuple[HouseholdItemInput, str]] = []
        if args.query:
            item = HouseholdItemInput(id="custom", name=args.query, search_query=args.query)
            queries.append((item, args.query))
        elif args.probe_demo:
            raw_demo = json.loads(DEMO_PATH.read_text(encoding="utf-8"))
            for entry in raw_demo["items"]:
                item = HouseholdItemInput.model_validate(entry)
                queries.append((item, item.search_query or item.name))

        raw_results: list[dict] = []
        print("\nProbing idealo catalog...\n")
        print(f"{'Item':34} | {'Matched Title':32} | {'Trusted €':>9} | {'Offers':>6} | {'30d Deal?':20}")
        print("-" * 115)

        for item, q in queries:
            bundle = await client.probe_item_raw(q, country=args.country, force_refresh=args.refresh)
            val = await client.value_item(item, force_refresh=False)
            raw_results.append({"item_id": item.id, "query": q, "bundle": bundle, "valuation": val.model_dump()})

            deal_str = f"YES (-{val.deal_discount_pct:.0f}%)" if val.is_buy_new_deal else "no"
            print(
                f"{item.name[:34]:34} | {val.matched_title[:32]:32} | "
                f"{val.trusted_market_price_eur:9.2f} | {val.offer_count:6d} | {deal_str:20}"
            )
            # Stay politely under the 3 req/s Trial-tier limit
            await asyncio.sleep(0.5)

        PROBE_OUT.write_text(json.dumps(raw_results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nSaved raw probe output -> {PROBE_OUT.relative_to(REPO_ROOT)}")
        print("Cached responses are now in data/cache/ — the web app will automatically use them!")


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe idealo MCP server with OAuth + disk cache")
    parser.add_argument("--list-tools", action="store_true", help="Authenticate and print available MCP tools")
    parser.add_argument("--probe-demo", action="store_true", help="Probe all items in data/demo_berlin_wg.json")
    parser.add_argument("--query", type=str, help="Probe a single product search query")
    parser.add_argument("--country", type=str, default="DE", help="idealo market code (DE, AT, GB, FR, IT, ES)")
    parser.add_argument("--callback-port", type=int, default=6274, help="Local OAuth redirect port (default: 6274)")
    parser.add_argument("--manual-callback", action="store_true", help="Paste redirect URL manually instead of loopback server")
    parser.add_argument("--refresh", action="store_true", help="Bypass local disk cache and call idealo live")
    args = parser.parse_args()

    if not (args.list_tools or args.probe_demo or args.query):
        args.list_tools = True

    asyncio.run(run_probe(args))


if __name__ == "__main__":
    main()
