"""Mock WebSocket telemetry server — emits the same JSON shape as ble_ws_bridge.py.

Use this to exercise the SmartPan app without BLE hardware. Simulates a
realistic sear cycle:
  - pan: 70°F -> ~400°F over ~30s, then plateaus
  - probe: ambient until t=30s ("meat placed"), then ramps toward 145°F
  - injects an outlier spike every ~25s (post-placement) so the chart's
    outlier filter visibly clamps it

Usage:
    pip install websockets
    python mock_telemetry.py [--port 8765] [--no-spike]
"""

import argparse
import asyncio
import json
import math
import random
import time
from typing import Set

import websockets


def f_to_c(f: float) -> float:
    return (f - 32) * 5 / 9


async def producer(clients: Set, *, spike: bool) -> None:
    t0 = time.monotonic()
    last_spike = -100.0
    while True:
        await asyncio.sleep(0.1)  # 10 Hz
        elapsed = time.monotonic() - t0

        # Pan: ambient 70°F -> 400°F asymptote, τ=20s
        pan_f = 70 + (400 - 70) * (1 - math.exp(-elapsed / 20))

        # Probe: idle at 70°F until t=30s, then climb toward 145°F (τ=120s)
        if elapsed < 30:
            probe_f = 70 + random.uniform(-0.5, 0.5)
        else:
            probe_f = 70 + (145 - 70) * (1 - math.exp(-(elapsed - 30) / 120))
            probe_f += random.uniform(-0.4, 0.4)

        # Periodic outlier so we can see the chart's filter behaviour
        if spike and elapsed > 40 and elapsed - last_spike > 25:
            last_spike = elapsed
            probe_f += 80.0  # 80°F spike → well above the 14°F/sec gate

        msg = {
            "latest_packet": None,
            "latest_sample": {
                "t_us": int(elapsed * 1e6),
                "adc": f_to_c(probe_f),  # probe (°C) — matches ble_pipeline.SensorData
                "tc": f_to_c(pan_f),     # pan (°C)
            },
            "properties": {
                "fault": 0,
                "warn_overtemp": 0,
                "curr_state": "DEMO",
            },
            "fault_strings": [],
            "fault_codes": [],
        }
        payload = json.dumps(msg)
        if not clients:
            continue
        dead = []
        # snapshot — handler may discard from `clients` concurrently on disconnect
        for ws in list(clients):
            try:
                await ws.send(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            clients.discard(ws)


async def main(args: argparse.Namespace) -> None:
    clients: Set = set()

    async def handler(ws):
        clients.add(ws)
        print(f"[ws] client connected ({len(clients)})")
        try:
            await ws.wait_closed()
        finally:
            clients.discard(ws)
            print(f"[ws] client disconnected ({len(clients)})")

    async with websockets.serve(handler, "0.0.0.0", args.port):
        print(f"[mock] listening on ws://0.0.0.0:{args.port}")
        print(f"[mock] phone should reach this at ws://<this-mac-LAN-IP>:{args.port}")
        await producer(clients, spike=not args.no_spike)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--no-spike", action="store_true", help="disable the periodic outlier spike")
    args = p.parse_args()
    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        print("\nstopped.")
