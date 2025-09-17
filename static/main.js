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

let ws = null;
let username = null;

function setStatus(text){ statusEl.textContent = text; }

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
  enterChat(u);
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

function enterChat(u){
  username = u;
  authSection.classList.add("hidden");
  chatSection.classList.remove("hidden");
  helloEl.textContent = "Hi，" + username;
  setStatus("已登入");
  connectWS();
}

function connectWS(){
  const token = localStorage.getItem("jwt");
  if (!token) return;
  //const wsUrl = "ws://" + location.host + "/ws?token=" + encodeURIComponent(token);
  
  const scheme = location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = scheme + location.host + "/ws?token=" + encodeURIComponent(token);
  console.log("Connecting with:", wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => console.log("✅ WebSocket opened");
  ws.onclose = (event) => {
    console.warn("❌ WebSocket closed:", event.code, event.reason);
    setStatus("連線中斷");
    setTimeout(connectWS, 3000); // 3 秒後重連
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    appendMessage(data, data.user === username);
  };
}

function appendMessage({ type, user, text, ts }, isMe = false) {
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
    when.textContent = ` ・${new Date(ts).toLocaleTimeString()}`;
    //when.textContent = ` ・${new Date(ts).toLocaleTimeString("zh-TW", { hour12: false })}`;
    meta.append(who, when);
    const body = document.createElement("div");
    body.textContent = text;
    bubble.append(meta, body);
  }
  wrap.append(bubble);
  messagesEl.append(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

chatForm.addEventListener("submit", e => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chat", text }));
  inputEl.value = "";
});

logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  username = null;
  authSection.classList.remove("hidden");
  chatSection.classList.add("hidden");
  setStatus("未登入");
  if (ws) try { ws.close(); } catch {}
});

(function boot(){
  const token = localStorage.getItem("jwt");
  const u = localStorage.getItem("username");
  if (token && u) enterChat(u);
})();