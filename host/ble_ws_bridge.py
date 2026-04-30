"""WebSocket bridge: BLE notifications -> JSON over WS for the SmartPan app.

This is a thin wrapper around the upstream Pipeline class in Sophie's repo at
`sophiezhou1/ece-design` (data_processing/ble_pipeline.py). Point this script
at her cloned repo — do NOT vendor a copy.

Usage:
    pip install bleak websockets

    # one-time: clone Sophie's repo somewhere, e.g. ~/code/ece-design
    git clone https://github.com/sophiezhou1/ece-design.git

    # then run the bridge, pointing it at her data_processing dir:
    python ble_ws_bridge.py --data-dir ~/code/ece-design/data_processing
    # or via env var:
    SMARTPAN_DATA_DIR=~/code/ece-design/data_processing python ble_ws_bridge.py

Other flags: --port 8765, --name sensor_set, --address <MAC>, --scan-seconds 20.

The app connects to ws://<this-machine-LAN-IP>:8765
"""

import argparse
import asyncio
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Set

import websockets
from bleak import BleakClient, BleakScanner


def _resolve_data_dir() -> Path:
    """Resolve the data_processing directory before we import from it.

    Precedence: --data-dir CLI flag > SMARTPAN_DATA_DIR env var > error.
    Errors clearly when nothing is set so the user knows to clone the repo.
    """
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--data-dir", default=None)
    known, _ = pre.parse_known_args()

    cand = known.data_dir or os.environ.get("SMARTPAN_DATA_DIR")
    if not cand:
        raise SystemExit(
            "ERROR: data_processing path not set.\n"
            "  Pass --data-dir <path> or set env var SMARTPAN_DATA_DIR.\n"
            "  Example: --data-dir ~/code/ece-design/data_processing"
        )
    p = Path(cand).expanduser().resolve()
    if not p.is_dir():
        raise SystemExit(f"ERROR: data_processing path does not exist: {p}")
    if not (p / "ble_pipeline.py").is_file():
        raise SystemExit(f"ERROR: ble_pipeline.py not found in: {p}")
    return p


# Resolve & inject the upstream repo path before importing Pipeline.
# Done at module load so argparse below can still reference DEFAULT_NAME.
_DATA_DIR = _resolve_data_dir()
sys.path.insert(0, str(_DATA_DIR))
print(f"[bridge] using data_processing at: {_DATA_DIR}")

from ble_pipeline import (  # noqa: E402  (path-dependent import)
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
    # We don't pre-emptively kill connections that are quietly waiting — some
    # peripherals are slow to send the first packet. We rely on bleak raising
    # on actual disconnect, which we catch and reconnect from.
    RECONNECT_BACKOFF_S = 5.0

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
        # snapshot — handler may discard from `clients` concurrently on disconnect
        for ws in list(clients):
            try:
                await ws.send(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            clients.discard(ws)

    async def ble_session() -> bool:
        """Run one BLE connection cycle. Returns True if it stalled (we want to retry)."""
        print(f"[ble] scanning for {args.scan_seconds:.0f}s...")
        dev = await BleakScanner.find_device_by_filter(
            _candidate_matcher(args.name, args.address), timeout=args.scan_seconds
        )
        if not dev:
            print(f"[ble] no matching device — retry in {RECONNECT_BACKOFF_S:.0f}s")
            return True

        pipeline = Pipeline()  # reset filter state on each reconnect
        queue: asyncio.Queue[bytearray] = asyncio.Queue(maxsize=200)
        try:
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
                        data = await queue.get()  # block indefinitely
                        pkt = pipeline.decode_packet(data)
                        if not pkt:
                            continue
                        state = pipeline.process_packet(pkt)
                        payload = json.dumps(_clean(state.as_dict()))
                        await broadcast(payload)
                finally:
                    try:
                        await client.stop_notify(CHAR_UUID)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[ble] session error: {type(e).__name__}: {e}")
            return True

    async def ble_loop():
        while True:
            stalled = await ble_session()
            if stalled:
                await asyncio.sleep(RECONNECT_BACKOFF_S)

    async with websockets.serve(ws_handler, "0.0.0.0", args.port):
        print(f"[ws] listening on ws://0.0.0.0:{args.port}")
        await ble_loop()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="BLE -> WebSocket bridge for the SmartPan app."
    )
    parser.add_argument("--data-dir", default=None,
                        help="Path to ece-design/data_processing (or set SMARTPAN_DATA_DIR).")
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
