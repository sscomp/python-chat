FROM python:3.11-slim

WORKDIR /code

# 更小的鏡像、裝系統需求
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 複製程式碼進容器
COPY ./code /code
COPY ./static /static
RUN mkdir -p /uploads

EXPOSE 8000
#CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
