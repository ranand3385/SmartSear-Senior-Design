"""WebSocket bridge: BLE notifications -> JSON over WS for the SmartPan app.

Wraps Pipeline from ble_pipeline.py and broadcasts state.as_dict() to all
connected clients on every BLE notification.

Drop this file next to ble_pipeline.py / filter_and_derive.py / etc.

Usage:
    pip install bleak websockets
    python ble_ws_bridge.py [--port 8765] [--name sensor_set] [--address ...]

The app connects to ws://<this-machine-LAN-IP>:8765
"""

import argparse
import asyncio
import json
import math
from typing import Any, Set

import websockets
from bleak import BleakClient, BleakScanner

from ble_pipeline import (
    CHAR_UUID,
    DEFAULT_NAME,
    Pipeline,
    _candidate_matcher,
)


def _clean(o: Any) -> Any:
    """Strip NaN/Inf so the payload is valid JSON."""
    if isinstance(o, float):
        if math.isnan(o) or math.isinf(o):
            return None
        return o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_clean(v) for v in o]
    return o


async def run(args: argparse.Namespace) -> None:
    print(f"[ble] scanning for {args.scan_seconds:.0f}s...")
    dev = await BleakScanner.find_device_by_filter(
        _candidate_matcher(args.name, args.address), timeout=args.scan_seconds
    )
    if not dev:
        raise RuntimeError(
            "No BLE device matched. Pass --address from `bleak`'s discovery output."
        )

    pipeline = Pipeline()
    queue: asyncio.Queue[bytearray] = asyncio.Queue(maxsize=200)
    clients: Set[Any] = set()

    async def ws_handler(websocket):
        clients.add(websocket)
        print(f"[ws] client connected ({len(clients)} total)")
        try:
            await websocket.wait_closed()
        finally:
            clients.discard(websocket)
            print(f"[ws] client disconnected ({len(clients)} remaining)")

    async def broadcast(payload: str) -> None:
        if not clients:
            return
        dead = []
        for ws in clients:
            try:
                await ws.send(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            clients.discard(ws)

    async def ble_loop():
        async with BleakClient(dev) as client:
            print(f"[ble] connected: {dev.address}")

            def on_notify(_handle: int, data: bytearray) -> None:
                if queue.full():
                    _ = queue.get_nowait()
                queue.put_nowait(data)

            await client.start_notify(CHAR_UUID, on_notify)
            print("[ble] subscribed; streaming to WS clients")
            try:
                while True:
                    data = await queue.get()
                    pkt = pipeline.decode_packet(data)
                    if not pkt:
                        continue
                    state = pipeline.process_packet(pkt)
                    payload = json.dumps(_clean(state.as_dict()))
                    await broadcast(payload)
            finally:
                await client.stop_notify(CHAR_UUID)

    async with websockets.serve(ws_handler, "0.0.0.0", args.port):
        print(f"[ws] listening on ws://0.0.0.0:{args.port}")
        await ble_loop()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default=DEFAULT_NAME)
    parser.add_argument("--address", default=None)
    parser.add_argument("--scan-seconds", type=float, default=20.0)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
