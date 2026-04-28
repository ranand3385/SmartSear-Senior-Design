import { useEffect, useRef, useState } from 'react';
import { TELEMETRY_WS_URL } from '../constants/config';

const cToF = (c) => (c == null || !Number.isFinite(c) ? null : c * 9 / 5 + 32);

export function useTelemetry(url = TELEMETRY_WS_URL) {
  const [state, setState] = useState({
    panF: null,
    meatF: null,
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
            panF: cToF(sample?.tc),
            meatF: cToF(sample?.adc),
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
