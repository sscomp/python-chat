let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const maxReconnectDelay = 30000; // 最長 30 秒

function connectWS() {
  const token = localStorage.getItem("jwt");
  if (!token) {
    console.error("❌ 找不到 JWT，請先登入");
    return;
  }

  const scheme = location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = scheme + location.host + "/ws?token=" + encodeURIComponent(token);

  console.log("🔗 嘗試連線:", wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("✅ WebSocket opened");
    setStatus("已連線");
    reconnectAttempts = 0; // 重置重連計數
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onclose = (event) => {
    console.warn("⚠️ WebSocket closed:", event.code, event.reason);
    setStatus("連線中斷");
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error("🔥 WebSocket error:", err);
    ws.close();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("📩 收到訊息:", data);

      if (data.type === "chat") {
        addMessage(`${data.user}: ${data.text}`, data.ts);
      } else if (data.type === "system") {
        addMessage(`[系統] ${data.text}`, data.ts);
      }
    } catch (e) {
      console.error("❌ 無法解析訊息:", event.data, e);
    }
  };
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(1000 * reconnectAttempts, maxReconnectDelay); // 遞增延遲，最大 30s
  console.log(`⏳ ${delay / 1000}s 後嘗試重連 (第 ${reconnectAttempts} 次)`);
  reconnectTimer = setTimeout(connectWS, delay);
}

// ✅ 當手機螢幕重新點亮 / PWA 從背景回到前景時 → 觸發檢查
window.addEventListener("focus", () => {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    console.log("🔄 前景化檢查：WebSocket 已關閉，嘗試重連...");
    connectWS();
  }
});

// 測試：登入成功後呼叫 connectWS()