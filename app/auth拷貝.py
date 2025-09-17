import os
import pyotp
import qrcode
import io
from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("APP_SECRET", "dev_only_replace_me")
ALGORITHM = "HS256"

# 簡易 in-memory DB
users = {}

def register_user(username: str):
    if username in users:
        raise ValueError("User exists")
    secret = pyotp.random_base32()
    users[username] = {"secret": secret}
    return secret

def get_qr_code(username: str, secret: str):
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
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

def create_token(username: str):
    expire = datetime.utcnow() + timedelta(hours=3)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None