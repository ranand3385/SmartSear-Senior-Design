"""Tail the BLE bridge's WS stream — prints each broadcast packet as a one-liner.

Usage:
    python host/ws_tail.py                    # formatted summary
    python host/ws_tail.py --raw              # full JSON per line
    python host/ws_tail.py --url ws://...     # connect to remote bridge
"""

import argparse
import asyncio
import json

import websockets


async def run(args: argparse.Namespace) -> None:
    print(f"[tail] connecting to {args.url} ...")
    while True:
        try:
            async with websockets.connect(args.url) as ws:
                print("[tail] connected — waiting for packets")
                async for msg in ws:
                    if args.raw:
                        print(msg)
                        continue
                    try:
                        d = json.loads(msg)
                    except Exception:
                        print(f"[parse error] {msg!r}")
                        continue
                    s = d.get("latest_sample") or {}
                    p = d.get("properties") or {}
                    pan = s.get("tc")
                    probe = s.get("adc")
                    slope = p.get("slope")
                    faults = d.get("fault_strings") or []
                    print(
                        f"pan={'   --' if pan is None else f'{pan:6.2f}'}°C  "
                        f"probe={'   --' if probe is None else f'{probe:6.2f}'}°C  "
                        f"slope={'    --' if slope is None else f'{slope:+6.3f}'}°C/min  "
                        f"faults={','.join(faults) if faults else 'none'}"
                    )
        except (ConnectionRefusedError, OSError) as e:
            print(f"[tail] connect error: {e}; retry in 2s")
            await asyncio.sleep(2)
        except websockets.ConnectionClosed:
            print("[tail] disconnected; reconnecting in 1s")
            await asyncio.sleep(1)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="ws://localhost:8765")
    p.add_argument("--raw", action="store_true", help="print full JSON instead of summary")
    args = p.parse_args()
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        print()
