import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from pydantic import ValidationError
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from app.mcp.client import FinancialTools
from app.orchestrator import answer, render_plan, handle_action
from app.schemas import ChatRequest, ChatResponse, QueryPlan, ActionRequest

@asynccontextmanager
async def lifespan(app):
    params = StdioServerParameters(command=sys.executable, args=["-m", "app.mcp.server"], env={key: value for key, value in os.environ.items() if key in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "PYTHONPATH", "FINANCIAL_DATA_DIR"}})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            app.state.mcp = session
            yield


app = FastAPI(title="BanorteHack Financial Intelligence", version="0.2.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai", "mode": "demo"}


@app.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request):
    return await answer(body, FinancialTools(request.app.state.mcp))


@app.get("/account")
async def account(request: Request):
    return await FinancialTools(request.app.state.mcp).call("get_account_overview")


@app.get("/dashboard", response_model=ChatResponse)
async def dashboard(request: Request):
    return await render_plan(QueryPlan(), FinancialTools(request.app.state.mcp))


@app.post("/actions", response_model=ChatResponse)
async def actions(body: ActionRequest, request: Request):
    try:
        return await handle_action(body.action, FinancialTools(request.app.state.mcp))
    except (ValueError, ValidationError):
        raise HTTPException(status_code=422, detail="Parámetros de acción inválidos.")
