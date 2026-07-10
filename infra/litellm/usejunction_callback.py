"""LiteLLM custom callback — posts compact metadata to UseJunction control plane."""

import os
import threading
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

INGEST_URL = os.environ.get("USEJUNCTION_INGEST_URL", "http://localhost:3001/api/ingest/request")
INGEST_SECRET = os.environ.get("USEJUNCTION_INGEST_SECRET", "change-me-ingest-secret")
ORG_ID = os.environ.get("USEJUNCTION_ORG_ID", "seed-org")


def _extract_trace_id(kwargs: dict, metadata: dict) -> Optional[str]:
    for key in ("trace_id", "generation_id", "langfuse_trace_id"):
        value = metadata.get(key)
        if value:
            return str(value)

    logging_obj = kwargs.get("standard_logging_object") or {}
    if isinstance(logging_obj, dict):
        for key in ("trace_id", "id"):
            value = logging_obj.get(key)
            if value:
                return str(value)

    litellm_call_id = kwargs.get("litellm_call_id")
    if litellm_call_id:
        return str(litellm_call_id)

    return None


def _header_value(headers: Optional[dict], key: str) -> Optional[str]:
    if not headers:
        return None
    for k, v in headers.items():
        if k.lower() == key.lower():
            return str(v) if v is not None else None
    return None


def _post_async(payload: dict) -> None:
    def _send():
        try:
            httpx.post(
                INGEST_URL,
                json=payload,
                headers={"Authorization": f"Bearer {INGEST_SECRET}"},
                timeout=5.0,
            )
        except Exception:
            pass

    threading.Thread(target=_send, daemon=True).start()


class UseJunctionLogger:
    """LiteLLM custom logger callback."""

    def log_success_event(self, kwargs: dict, response_obj: Any, start_time: datetime, end_time: datetime):
        self._log_event(kwargs, response_obj, start_time, end_time, "success")

    def log_failure_event(self, kwargs: dict, response_obj: Any, start_time: datetime, end_time: datetime):
        self._log_event(kwargs, response_obj, start_time, end_time, "error")

    def _log_event(self, kwargs: dict, response_obj: Any, start_time: datetime, end_time: datetime, status: str):
        litellm_params = kwargs.get("litellm_params") or {}
        metadata = litellm_params.get("metadata") or kwargs.get("metadata") or {}
        headers = litellm_params.get("headers") or kwargs.get("headers") or {}

        user_id = metadata.get("usejunction_user") or _header_value(headers, "x-usejunction-user")
        device_id = metadata.get("usejunction_device") or _header_value(headers, "x-usejunction-device")
        tool_name = metadata.get("usejunction_tool") or _header_value(headers, "x-usejunction-tool")

        model = kwargs.get("model") or getattr(response_obj, "model", None)
        provider = (model or "").split("/")[0] if model else None

        usage = getattr(response_obj, "usage", None) or {}
        if isinstance(usage, dict):
            input_tokens = usage.get("prompt_tokens", 0) or 0
            output_tokens = usage.get("completion_tokens", 0) or 0
            total_tokens = usage.get("total_tokens", input_tokens + output_tokens) or 0
        else:
            input_tokens = getattr(usage, "prompt_tokens", 0) or 0
            output_tokens = getattr(usage, "completion_tokens", 0) or 0
            total_tokens = getattr(usage, "total_tokens", input_tokens + output_tokens) or 0

        latency_ms = 0
        if start_time and end_time:
            latency_ms = int((end_time - start_time).total_seconds() * 1000)

        cost = kwargs.get("response_cost") or 0
        trace_id = _extract_trace_id(kwargs, metadata)

        payload = {
            "orgId": ORG_ID,
            "userId": user_id,
            "deviceId": device_id,
            "toolName": tool_name,
            "provider": provider,
            "model": model,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "totalTokens": total_tokens,
            "estimatedCost": float(cost) if cost else 0,
            "latencyMs": latency_ms,
            "status": status,
            "traceId": trace_id,
            "source": "gateway",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        _post_async(payload)


usejunction_logger = UseJunctionLogger()
