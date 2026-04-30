import { useEffect, useRef, useState } from 'react';
import { TELEMETRY_WS_URL } from '../constants/config';

const finiteOrNull = (n) => (Number.isFinite(n) ? n : null);
// pipeline emits slope in °C/min; convert to °C/sec at the boundary
const slopeCPerMinToCPerSec = (s) =>
  s == null || !Number.isFinite(s) ? null : s / 60;

export function useTelemetry(url = TELEMETRY_WS_URL) {
  const [state, setState] = useState({
    panC: null,
    meatC: null,
    slopeCPerSec: null,
    faults: [],
    fsmState: null,
    connected: false,
  });
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, 2000);
    };

    const connect = () => {
      if (cancelled) return;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (_) {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setState((s) => ({ ...s, connected: true }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // ble_pipeline.SensorData: adc=probe(°C), tc=pan(°C)
          const sample = msg?.latest_sample;
          const props = msg?.properties ?? {};
          setState({
            panC: finiteOrNull(sample?.tc),
            meatC: finiteOrNull(sample?.adc),
            slopeCPerSec: slopeCPerMinToCPerSec(props?.slope),
            faults: Array.isArray(msg?.fault_strings) ? msg.fault_strings : [],
            fsmState: props?.curr_state ?? null,
            connected: true,
          });
        } catch (_) {
          // ignore malformed payload
        }
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        scheduleReconnect();
      };
      ws.onerror = () => {
        try { ws.close(); } catch (_) {}
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
        wsRef.current = null;
      }
    };
  }, [url]);

  return state;
}
