const $ = (s) => document.querySelector(s);

const statusEl = $("#status");
const loginCard = $("#login-card");
const registerCard = $("#register-card");
const gotoRegister = $("#goto-register");
const gotoLogin = $("#goto-login");

const loginForm = $("#login-form");
const loginUsername = $("#login-username");
const loginOtp = $("#login-otp");

const registerForm = $("#register-form");
const regUsername = $("#reg-username");
const qrWrap = $("#qr-wrap");
const qrImg = $("#qr-img");

const authSection = $("#auth");
const chatSection = $("#chat");
const helloEl = $("#hello");
const logoutBtn = $("#logout");
const messagesEl = $("#messages");
const chatForm = $("#chat-form");
const inputEl = $("#message-input");
const typingEl = $("#typing");
const uploadBtn = $("#upload-btn");
const fileInput = $("#file-input");

let ws = null;
let username = null;

const newMsgBtn = document.createElement('button');
newMsgBtn.id = 'new-messages';
newMsgBtn.textContent = '有新訊息，點擊查看';
newMsgBtn.className = 'ghost hidden';
Object.assign(newMsgBtn.style, {
  position: 'fixed',
  right: '1.5rem',
  bottom: '6rem',
  zIndex: '30'
});
newMsgBtn.addEventListener('click', () => {
  scrollToBottom();
  hideNewMessageIndicator();
});
chatSection.appendChild(newMsgBtn);

function isNearBottom(){
  const threshold = 40;
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < threshold;
}

function scrollToBottom(){
  if (!messagesEl) return;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // 先在下一幀嘗試捲動，確保 layout 已更新
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Safari 有時候還需要等 layout 完成
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 100);
  });
}

function showNewMessageIndicator(){
  newMsgBtn.classList.remove('hidden');
}

function hideNewMessageIndicator(){
  newMsgBtn.classList.add('hidden');
}

messagesEl.addEventListener('scroll', () => {
  if (isNearBottom()) hideNewMessageIndicator();
});

function setStatus(text){ statusEl.textContent = text; }

function isImageAttachment(contentType, filename) {
  if (contentType && contentType.startsWith('image/')) return true;
  if (!filename) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
}

// 切換
gotoRegister.addEventListener("click", e => {
  e.preventDefault();
  loginCard.classList.add("hidden");
  registerCard.classList.remove("hidden");
});
gotoLogin.addEventListener("click", e => {
  e.preventDefault();
  registerCard.classList.add("hidden");
  loginCard.classList.remove("hidden");
});

// 登入
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const u = loginUsername.value.trim();
  const otp = loginOtp.value.trim();
  if (!u || !otp) return;

  const fd = new FormData();
  fd.append("username", u);
  fd.append("otp", otp);

  const res = await fetch("/login", { method: "POST", body: fd });
  if (!res.ok) {
    alert("登入失敗");
    loginOtp.value = "";
    return;
  }
  const data = await res.json();
  localStorage.setItem("jwt", data.access_token);
  localStorage.setItem("username", u);
  await enterChat(u);
});

// 註冊
registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  const u = regUsername.value.trim();
  if (!u) return;

  const fd = new FormData();
  fd.append("username", u);
  const res = await fetch("/register", { method: "POST", body: fd });
  if (!res.ok) {
    alert("註冊失敗");
    return;
  }
  const blob = await res.blob();
  qrImg.src = URL.createObjectURL(blob);
  qrWrap.classList.remove("hidden");
});

async function enterChat(u){
  username = u;
  authSection.classList.add("hidden");
  chatSection.classList.remove("hidden");
  helloEl.textContent = "Hi，" + username;
  setStatus("已登入");
  await loadHistory();
  connectWS();
}

async function loadHistory(){
  messagesEl.innerHTML = "";
  hideNewMessageIndicator();
  try {
    const res = await fetch("/history");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const history = await res.json();
    if (Array.isArray(history)) {
      history.forEach(msg => appendMessage(msg, msg.user === username));
    }
    scrollToBottom();
  } catch (err) {
    console.error("Failed to load history", err);
  }
}


async function connectWS(reloadHistory = false){
  const token = localStorage.getItem("jwt");
  if (!token) return;
  if (reloadHistory) await loadHistory();
  //const wsUrl = "ws://" + location.host + "/ws?token=" + encodeURIComponent(token);
  
  const scheme = location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = scheme + location.host + "/ws?token=" + encodeURIComponent(token);
  console.log("Connecting with:", wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("✅ WebSocket opened");
    setStatus("已登入");
  };
  ws.onclose = (event) => {
    console.warn("❌ WebSocket closed:", event.code, event.reason);
    setStatus("連線中斷");
    setTimeout(() => connectWS(true), 3000); // 3 秒後重連
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    appendMessage(data, data.user === username);
  };
}

function appendMessage({ type, user, text, ts, url, filename, content_type }, isMe = false) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${type === "system" ? "system" : ""} ${isMe ? "me" : ""}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (type === "system") {
    bubble.textContent = `🔔 ${text}`;
  } else {
    const meta = document.createElement("div");
    meta.className = "meta";
    const who = document.createElement("span");
    who.className = "user";
    who.textContent = user;
    const when = document.createElement("span");
    const displayTime = ts ? new Date(ts) : new Date();
    when.textContent = ` ・${displayTime.toLocaleTimeString()}`;
    //when.textContent = ` ・${new Date(ts).toLocaleTimeString("zh-TW", { hour12: false })}`;
    meta.append(who, when);
    const body = document.createElement("div");
    if (type === "file") {
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `📎 ${filename || '附件'}`;
        link.className = "attachment-link";
        body.append(link);
        if (isImageAttachment(content_type, filename)) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = filename || "attachment";
          img.className = "attachment-image";
          body.append(img);
        }
      } else {
        body.textContent = `${user} 分享了附件`;
      }
    } else {
      body.textContent = text;
    }
    bubble.append(meta, body);
  }
  wrap.append(bubble);

  const wasNearBottom = isNearBottom();
  messagesEl.append(wrap);

  if (wasNearBottom || isMe) {
    scrollToBottom();
    hideNewMessageIndicator();
  } else {
    showNewMessageIndicator();
  }
}

chatForm.addEventListener("submit", e => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chat", text }));
  inputEl.value = "";
  scrollToBottom();
});

async function uploadFile(file) {
  const token = localStorage.getItem("jwt");
  if (!token) {
    alert("請先登入");
    return;
  }

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: fd,
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("Upload failed", err);
    alert("上傳失敗，請稍後再試");
  }
}

if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadBtn.disabled = true;
    try {
      await uploadFile(file);
    } finally {
      uploadBtn.disabled = false;
      fileInput.value = "";
    }
  });
}

logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  username = null;
  authSection.classList.remove("hidden");
  chatSection.classList.add("hidden");
  setStatus("未登入");
  if (ws) try { ws.close(); } catch {}
});

(async function boot(){
  const token = localStorage.getItem("jwt");
  const u = localStorage.getItem("username");
  if (token && u) await enterChat(u);
})();
