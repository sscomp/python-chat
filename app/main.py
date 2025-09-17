import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Form, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import io

from datetime import datetime
from zoneinfo import ZoneInfo

from app import auth

app = FastAPI()

# CORS (開發用)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 靜態檔案
app.mount("/static", StaticFiles(directory="static"), name="static")

# ---- API 區 ----

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
    with open("app/templates/index.html", encoding="utf-8") as f:
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
        for ws, _ in self.active:
            await ws.send_json(message)

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