"""Small request-body guard for the hand-video multipart upload route."""

from __future__ import annotations

from starlette.responses import JSONResponse


class _RequestBodyTooLarge(Exception):
    pass


class VideoUploadBodyLimitMiddleware:
    """Reject an oversized video request before multipart parsing buffers it."""

    def __init__(self, app, *, max_request_bytes: int) -> None:
        self.app = app
        self.max_request_bytes = int(max_request_bytes)

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/api/v1/inference/hand/video"
        ):
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_request_bytes:
                    response = JSONResponse(
                        {"detail": {"code": "upload_too_large", "message": "Video upload exceeds the size limit."}},
                        status_code=413,
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_request_bytes:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            response = JSONResponse(
                {"detail": {"code": "upload_too_large", "message": "Video upload exceeds the size limit."}},
                status_code=413,
            )
            await response(scope, receive, send)
