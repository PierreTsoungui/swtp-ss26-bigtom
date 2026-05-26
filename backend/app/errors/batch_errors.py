from fastapi import HTTPException
from fastapi.responses import JSONResponse

class BatchException(HTTPException):
    def __init__(self, status_code: int, error_code: str, message: str, detail: dict = None):
        super().__init__(status_code=status_code, detail=message)
        self.error_code = error_code
        self.message = message
        self.custom_detail = detail or {}

def batch_exception_handler(request, exc: BatchException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "detail": exc.custom_detail
        }
    )