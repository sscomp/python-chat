import os
import pyotp
import qrcode
import io
import json
from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("APP_SECRET", "dev_only_replace_me")
ALGORITHM = "HS256"

USER_FILE = "users.json"   # 存放使用者資料的檔案

# --------------------------
# 使用者存取
# --------------------------
def load_users():
    if os.path.exists(USER_FILE):
        try:
            with open(USER_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_users(users):
    with open(USER_FILE, "w") as f:
        json.dump(users, f)

users = load_users()

# --------------------------
# 註冊 / OTP
# --------------------------
def register_user(username: str):
    if username in users:
        raise ValueError("User exists")
    secret = pyotp.random_base32()
    users[username] = {"secret": secret}
    save_users(users)  # ✅ 存檔
    return secret

def get_qr_code(username: str, secret: str):
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=username, issuer_name="PythonChatApp"
    )
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def verify_otp(username: str, otp: str):
    user = users.get(username)
    if not user:
        return False
    totp = pyotp.TOTP(user["secret"])
    return totp.verify(otp)

# --------------------------
# JWT
# --------------------------
def create_token(username: str):
    expire = datetime.utcnow() + timedelta(hours=3)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception as e:
        print(f"❌ [DEBUG] Token verify failed: {e}")
        return None