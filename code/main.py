import os
import json
import shutil
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    Request,
    Form,
    HTTPException,
    UploadFile,
    File,
    Depends,
    Header,
)
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import io



import auth

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent


def find_path(*candidates: Path) -> Path:
    for path in candidates:
        if path.exists():
            return path
    raise RuntimeError(f"None of the candidate paths exist: {candidates}")


STATIC_DIR = find_path(
    BASE_DIR / "static",
    ROOT_DIR / "static",
    Path("/static"),
)

TEMPLATE_DIR = find_path(
    BASE_DIR / "templates",
    ROOT_DIR / "templates",
)

UPLOAD_DIR = (ROOT_DIR / "uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# CORS (開發用)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 靜態檔案
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ---- API 區 ----

# --------------------------
# 簡易聊天歷史記錄（記憶體）
# --------------------------
chat_history = []
MAX_HISTORY = 1000

def save_message(message: dict):
    """保存訊息到歷史快取"""
    chat_history.append(message)
    if len(chat_history) > MAX_HISTORY:
        chat_history.pop(0)


def get_current_user(authorization: str = Header(None)) -> str:
    """從 Authorization header 驗證使用者"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    username = auth.verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return username

@app.get("/history")
def get_history():
    """取得最近的聊天記錄"""
    return chat_history


@app.post("/register")
def register(username: str = Form(...)):
    try:
        secret = auth.register_user(username)
        qr_png = auth.get_qr_code(username, secret)
        return StreamingResponse(io.BytesIO(qr_png), media_type="image/png")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/login")
def login(username: str = Form(...), otp: str = Form(...)):
    if not auth.verify_otp(username, otp):
        raise HTTPException(status_code=401, detail="Invalid OTP")
    token = auth.create_token(username)
    return {"access_token": token}

@app.get("/me")
def get_me(request: Request):
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    jwt_token = token.split(" ", 1)[1]
    username = auth.verify_token(jwt_token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"username": username}

@app.get("/")
def index():
    with open(TEMPLATE_DIR / "index.html", encoding="utf-8") as f:
        return HTMLResponse(f.read())

# ---- WebSocket ----

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active.append((websocket, username))
        await self.broadcast({"type": "system", "text": f"{username} 加入聊天室"})

    def disconnect(self, websocket: WebSocket):
        for conn in self.active:
            if conn[0] == websocket:
                self.active.remove(conn)
                break

    async def broadcast(self, message: dict):
        message_to_send = dict(message)
        message_to_send.setdefault("ts", datetime.utcnow().isoformat())
        save_message(message_to_send)
        for ws, _ in self.active:
            await ws.send_json(message_to_send)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    username = auth.verify_token(token) if token else None
    print("DEBUG WS token:", token)
    print("DEBUG WS username:", username)

    if not username:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, username)

    try:
        while True:
            data = await websocket.receive_json()
            if data["type"] == "chat":
                await manager.broadcast({
                    "type": "chat",
                    "user": username,
                    "text": data["text"],
                    "ts": datetime.utcnow().isoformat()
                    #"ts": datetime.now(ZoneInfo("Asia/Taipei")).strftime("%H:%M:%S")
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast({"type": "system", "text": f"{username} 離開聊天室"})


@app.post("/upload")
async def upload(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    """接收檔案上傳並廣播附件訊息"""
    original_name = file.filename or "attachment"
    suffix = Path(original_name).suffix[:10]
    unique_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid4().hex}{suffix}"
    dest_path = UPLOAD_DIR / unique_name

    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    await file.close()

    public_url = f"/uploads/{unique_name}"
    message = {
        "type": "file",
        "user": current_user,
        "url": public_url,
        "filename": original_name,
        "content_type": file.content_type,
        "ts": datetime.utcnow().isoformat(),
    }
    await manager.broadcast(message)

    return {
        "url": public_url,
        "filename": original_name,
        "content_type": file.content_type,
    }
