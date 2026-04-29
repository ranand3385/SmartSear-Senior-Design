"""Mock WebSocket telemetry server — emits the same JSON shape as ble_ws_bridge.py.

Use this to exercise the SmartPan app without BLE hardware.

Default cycle (matches `python mock_telemetry.py` with no flags):
  - pan: 70°F -> 400°F asymptote, τ=20s
  - probe: ambient until t=30s, then approach 145°F (τ=120s)
  - inject an outlier spike every ~25s to exercise the chart's filter

Knobs:
  --pan-target <°F>    pan asymptote (default 400)
  --pan-tau <s>        pan ramp time constant (default 20)
  --pan-instant        skip ramp; pan immediately at target
  --probe-target <°F>  probe asymptote (default 145)
  --probe-tau <s>      probe ramp time constant (default 120)
  --probe-delay <s>    seconds before probe starts ramping (default 30)
  --probe-instant      skip delay/ramp; probe immediately at target
  --no-spike           disable the periodic outlier spike
  --port <n>           WS port (default 8765)

Test recipes:
  # Pan-temp scaling: hot pan, default probe — verify cook timer halves
  python mock_telemetry.py --pan-target 750 --pan-instant

  # Probe early-end: fast probe ramp to medium_rare target before timer expires
  python mock_telemetry.py --pan-target 750 --pan-instant \
      --probe-tau 25 --probe-delay 0 --no-spike
"""

import argparse
import asyncio
import json
import math
import random
import time

import websockets

AMBIENT_F = 70.0


def f_to_c(f: float) -> float:
    return (f - 32) * 5 / 9


def _build_payload(elapsed: float, last_spike: float, args: argparse.Namespace) -> tuple[dict, float]:
    """Return (msg, last_spike) given client-relative elapsed time."""
    # Pan
    if args.pan_instant:
        pan_f = args.pan_target
    else:
        pan_f = AMBIENT_F + (args.pan_target - AMBIENT_F) * (1 - math.exp(-elapsed / args.pan_tau))

    # Probe + analytic dprobe/dt for slope reporting (matches ble_pipeline °C/min)
    if args.probe_instant:
        probe_f = args.probe_target + random.uniform(-0.3, 0.3)
        slope_c_per_min = 0.0
    elif elapsed < args.probe_delay:
        probe_f = AMBIENT_F + random.uniform(-0.5, 0.5)
        slope_c_per_min = 0.0
    else:
        probe_f = AMBIENT_F + (args.probe_target - AMBIENT_F) * (
            1 - math.exp(-(elapsed - args.probe_delay) / args.probe_tau)
        )
        probe_f += random.uniform(-0.4, 0.4)
        # d/dt of (T_amb + (T_tgt - T_amb)(1 - e^-(t-d)/τ)) is (T_tgt - T_amb)/τ * e^-(t-d)/τ
        slope_f_per_sec = ((args.probe_target - AMBIENT_F) / args.probe_tau
                           * math.exp(-(elapsed - args.probe_delay) / args.probe_tau))
        slope_c_per_min = slope_f_per_sec * (5 / 9) * 60

    # Periodic outlier so we can see the chart's filter behaviour
    if not args.no_spike and elapsed > 40 and elapsed - last_spike > 25:
        last_spike = elapsed
        probe_f += 80.0

    msg = {
        "latest_packet": None,
        "latest_sample": {
            "t_us": int(elapsed * 1e6),
            "adc": f_to_c(probe_f),
            "tc": f_to_c(pan_f),
        },
        "properties": {
            "fault": 0,
            "warn_overtemp": 0,
            "curr_state": "DEMO",
            "slope": slope_c_per_min,  # °C/min, matches ble_pipeline.MovingLinearRegression
        },
        "fault_strings": [],
        "fault_codes": [],
    }
    return msg, last_spike


async def emit_to_client(ws, args: argparse.Namespace) -> None:
    """Per-client task: t0 is set on connection so every reload starts fresh."""
    t0 = time.monotonic()
    last_spike = -100.0
    try:
        while True:
            await asyncio.sleep(0.1)
            elapsed = time.monotonic() - t0
            msg, last_spike = _build_payload(elapsed, last_spike, args)
            await ws.send(json.dumps(msg))
    except websockets.exceptions.ConnectionClosed:
        return
    except Exception:
        return


async def main(args: argparse.Namespace) -> None:
    async def handler(ws):
        print(f"[ws] client connected — starting fresh curve (t=0)")
        try:
            await emit_to_client(ws, args)
        finally:
            print(f"[ws] client disconnected")

    async with websockets.serve(handler, "0.0.0.0", args.port):
        print(f"[mock] listening on ws://0.0.0.0:{args.port}")
        print(f"[mock] pan target={args.pan_target}°F instant={args.pan_instant} τ={args.pan_tau}s")
        print(f"[mock] probe target={args.probe_target}°F instant={args.probe_instant} "
              f"delay={args.probe_delay}s τ={args.probe_tau}s")
        print(f"[mock] spike={'off' if args.no_spike else 'on'}")
        print(f"[mock] each new client connection starts the curve at t=0")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--pan-target", type=float, default=400.0, help="pan asymptote in °F")
    p.add_argument("--pan-tau", type=float, default=20.0, help="pan ramp time constant in s")
    p.add_argument("--pan-instant", action="store_true", help="skip ramp; pan immediately at target")
    p.add_argument("--probe-target", type=float, default=145.0, help="probe asymptote in °F")
    p.add_argument("--probe-tau", type=float, default=120.0, help="probe ramp time constant in s")
    p.add_argument("--probe-delay", type=float, default=30.0, help="seconds before probe starts ramping")
    p.add_argument("--probe-instant", action="store_true", help="probe immediately at target")
    p.add_argument("--no-spike", action="store_true", help="disable periodic outlier spike")
    args = p.parse_args()
    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        print("\nstopped.")
