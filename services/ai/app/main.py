from fastapi import FastAPI
from app.orchestrator import answer
from app.schemas import ChatRequest, ChatResponse

app = FastAPI(title="BanorteHack AI", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai", "mode": "demo"}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    return answer(request.message)
