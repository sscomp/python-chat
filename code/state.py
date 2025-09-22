from typing import Dict, Set, List, Any
from collections import deque
from asyncio import Lock

class ChatState:
    def __init__(self, history_limit: int = 50):
        self.connections: Set[Any] = set()
        self.usernames: Dict[Any, str] = {}
        self.history: deque = deque(maxlen=history_limit)
        self.lock = Lock()

    async def join(self, websocket, username: str):
        async with self.lock:
            self.connections.add(websocket)
            self.usernames[websocket] = username

    async def leave(self, websocket):
        async with self.lock:
            self.connections.discard(websocket)
            self.usernames.pop(websocket, None)

    def get_username(self, websocket) -> str:
        return self.usernames.get(websocket, "匿名")

    async def broadcast(self, message: dict):
        # 同步送出，不因單個錯誤中斷
        dead = []
        for ws in list(self.connections):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.leave(ws)

    def save_history(self, message: dict):
        self.history.append(message)

    def get_history(self) -> List[dict]:
        return list(self.history)
