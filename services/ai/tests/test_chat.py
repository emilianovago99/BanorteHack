import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import shutil
    from pathlib import Path
    dataset = tmp_path_factory.mktemp("chat-dataset")
    source = Path(__file__).resolve().parents[3] / "datasets/synthetic"
    for name in ("profile.json", "transactions.csv"):
        shutil.copyfile(source / name, dataset / name)
    with pytest.MonkeyPatch.context() as env:
        env.setenv("FINANCIAL_DATA_DIR", str(dataset))
        env.setenv("AI_MODE", "local")
        with TestClient(app) as test_client:
            yield test_client


@pytest.mark.parametrize("message", ["Resumen", "Ingresos", "Gastos", "Presupuestos", "Suscripciones", "Deudas", "Movimientos", "Quiero invertir"])
def test_generated_components_conform_to_catalog(client, monkeypatch, message):
    import json
    from pathlib import Path
    from jsonschema import Draft202012Validator
    monkeypatch.setenv("AI_MODE", "local")
    schema = json.loads((Path(__file__).resolve().parents[3] / "packages/visual-engine/catalog.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    result = client.post("/chat", json={"message": message})
    assert result.status_code == 200
    for node in result.json()["a2ui"][2]["updateComponents"]["components"]:
        validator.validate(node)


@pytest.mark.parametrize("message,domain", [("Mi crédito", "deudas"), ("Quiero invertir", "inversiones"), ("Mi nómina", "ingresos")])
def test_chat_domains(client, message, domain):
    response = client.post("/chat", json={"message": message})
    assert response.status_code == 200
    body = response.json()
    assert body["domain"] == domain
    assert body["mode"] == "demo"
    assert len(body["visualization"]["labels"]) == len(body["visualization"]["values"])
    assert body["a2ui"][0]["version"] == "v0.9"
    assert body["tools_used"]


@pytest.mark.parametrize("message,expected", [
    ("¿Quién ganó el partido de ayer?", "No puedo resolver esa consulta"),
    ("Hola", "No puedo resolver esa consulta"),
])
def test_non_financial_or_unintelligible_messages_use_mcp_help(client, monkeypatch, message, expected):
    monkeypatch.setenv("AI_MODE", "local")
    result = client.post("/chat", json={"message": message})
    assert result.status_code == 200
    body = result.json()
    assert expected in body["message"]
    assert body["tools_used"] == ["report_query_issue"]


@pytest.mark.parametrize("message", ["", "   ", "x" * 2001])
def test_invalid_messages(client, message):
    assert client.post("/chat", json={"message": message}).status_code == 422


def test_plan_selection_and_conversation_followup(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "local")
    plans = client.post("/chat", json={"message": "Quiero invertir $10000"}).json()
    nodes = plans["a2ui"][2]["updateComponents"]["components"]
    card = next(node for node in nodes if node["component"] == "PlanCard" and node["action"]["event"]["context"]["plan_id"] == "balanced")
    result = client.post("/actions", json={"version": "v0.9", "action": {**card["action"]["event"], "surfaceId": plans["surface_id"], "sourceComponentId": card["id"], "timestamp": "2026-09-12T12:00:00Z"}})
    assert result.status_code == 200
    selected = result.json()
    assert "project_investment" in selected["tools_used"]
    followup = client.post("/chat", json={"message": "¿Y si aporto $2,000 al mes?", "simulation": selected["simulation"]}).json()
    assert followup["simulation"] == {"plan_id": "balanced", "amount": 10000, "months": 24, "monthly_contribution": 2000}
    assert followup["surface_id"] != selected["surface_id"]
    assert followup["message"] != selected["message"]


@pytest.mark.parametrize("name,context", [("execute_transfer", {}), ("simulate_investment", {"plan_id": "balanced", "amount": -1}), ("simulate_debt", {"debt_id": "someone-else"}), ("simulate_investment", {"plan_id": "balanced", "months": 99999})])
def test_invalid_actions_cannot_execute_or_overflow(client, name, context):
    result = client.post("/actions", json={"action": {"name": name, "surfaceId": "test", "sourceComponentId": "test", "timestamp": "", "context": context}})
    assert result.status_code == 422


def test_month_and_merchant_breakdown(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "local")
    result = client.post("/chat", json={"message": "¿En qué comercios gasté más en julio 2025?"}).json()
    assert result["period"] == "2025-07"
    assert result["domain"] == "gastos"
    assert "get_spending_breakdown" in result["tools_used"]
    assert "Residencial Encino" in result["message"]


def test_customize_active_surface_through_mcp(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "local")
    original = client.post("/chat", json={"message": "Gastos de julio 2025"}).json()
    result = client.post("/chat", json={"message": "Orden ascendente por monto y color azul", "current_view": original})
    assert result.status_code == 200
    updated = result.json()
    assert updated["domain"] == "gastos"
    assert updated["period"] == "2025-07"
    assert updated["workspace_operation"] == "update"
    assert updated["tools_used"] == ["customize_financial_view"]
    assert updated["visualization"]["values"] == sorted(original["visualization"]["values"])
    assert sum(updated["visualization"]["values"]) == pytest.approx(sum(original["visualization"]["values"]))
    nodes = updated["a2ui"][2]["updateComponents"]["components"]
    assert all(node["palette"][0] == "#2563eb" for node in nodes if node["component"] == "FinancialChart")
    copy = client.post("/chat", json={"message": "Nueva pestaña en orden descendente", "current_view": updated}).json()
    assert copy["workspace_operation"] == "create"
def test_confirm_debt_payment_alters_overview(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "local")
    before = client.get("/account").json()["balance"]
    result = client.post("/actions", json={"action": {
        "name": "confirm_debt_payment", "surfaceId": "test", "sourceComponentId": "test", "timestamp": "",
        "context": {"debt_id": "laptop", "extra_payment": 100}
    }})
    assert result.status_code == 200
    transaction = result.json()["transaction"]
    assert transaction["confirmed"] is True
    assert transaction["balance_after"] == pytest.approx(before - 100)
    assert client.get("/account").json()["balance"] == transaction["balance_after"]


def test_missing_data_uses_help_tool(client):
    result = client.post("/chat", json={"message": "Gastos de enero de 2030"}).json()
    assert "report_query_issue" in result["tools_used"]
    assert "No encontré datos" in result["message"]


def test_strict_gemini_failure_does_not_invent_answer(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    result = client.post("/chat", json={"message": "Mis ingresos"}).json()
    assert result["interpretation"] == "unavailable"
    assert result["tools_used"] == ["report_query_issue"]
    assert "No pude conseguir" in result["message"]


@pytest.mark.parametrize("message", ["m", "?", "asdfgh"])
def test_unclear_input_returns_only_notice_without_mcp(client, monkeypatch, message):
    monkeypatch.setenv("AI_MODE", "local")
    result = client.post("/chat", json={"message": message})
    assert result.status_code == 200
    body = result.json()
    assert body["domain"] == "clarificacion"
    assert body["tools_used"] == []
    nodes = body["a2ui"][2]["updateComponents"]["components"]
    assert {node["component"] for node in nodes} == {"Column", "Notice"}
    assert all("action" not in node and "transactionalAction" not in node for node in nodes)


def test_analytical_chart_does_not_need_transaction(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "local")
    body = client.post("/chat", json={"message": "¿En qué gasté más este mes?"}).json()
    nodes = body["a2ui"][2]["updateComponents"]["components"]
    assert any(n["component"] == "FinancialChart" and "transactionalAction" not in n for n in nodes)
    assert any(n["component"] == "DataTable" for n in nodes)
    assert all(n["component"] != "Notice" for n in nodes)
    assert "confirm_debt_payment" not in body["tools_used"]


def test_cards_require_contextual_actions_and_customization_preserves_them(client, monkeypatch):
    monkeypatch.setenv("AI_MODE", "local")
    for message, component, event, kind in [
        ("Deudas", "DebtCard", "confirm_debt_payment", "mutation"),
        ("Quiero invertir", "PlanCard", "select_plan", "simulation"),
    ]:
        body = client.post("/chat", json={"message": message}).json()
        nodes = body["a2ui"][2]["updateComponents"]["components"]
        cards = [n for n in nodes if n["component"] == component]
        assert cards
        for card in cards:
            assert card["transactionalAction"]["event"]["name"] == event
            assert card["transactionalAction"]["kind"] == kind
        updated = client.post("/chat", json={"message": "En color azul", "current_view": body})
        assert updated.status_code == 200
        assert updated.json()["a2ui"] == body["a2ui"]
        del cards[0]["transactionalAction"]
        assert client.post("/chat", json={"message": "En color azul", "current_view": body}).status_code == 422

def test_explicit_clarification_plan_uses_local_notice():
    import asyncio
    from app.orchestrator import render_plan
    from app.schemas import QueryPlan
    class NoTools:
        calls = []
        async def call(self, *args, **kwargs):
            pytest.fail("Clarification must not call MCP")
    response = asyncio.run(render_plan(QueryPlan(intent="clarificacion"), NoTools()))
    assert response.domain == "clarificacion"
    assert {node["component"] for node in response.a2ui[2]["updateComponents"]["components"]} == {"Column", "Notice"}


@pytest.mark.parametrize("message", ["m", "asdfgh", "?"])
def test_guardrails_run_before_provider(client, monkeypatch, message):
    monkeypatch.setenv("AI_MODE", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    result = client.post("/chat", json={"message": message}).json()
    assert result["domain"] == "clarificacion"
    assert result["interpretation"] == "local"
    assert result["tools_used"] == []


def test_query_issue_still_renders_notice_when_help_tool_fails():
    import asyncio
    from app.orchestrator import query_issue
    from app.mcp.client import FinancialQueryError
    class FailedTools:
        calls = []
        async def call(self, *args, **kwargs):
            raise FinancialQueryError("MCP unavailable")
    response = asyncio.run(query_issue(FailedTools(), "unavailable"))
    assert response.interpretation == "unavailable"
    assert "No pude conseguir" in response.message
    assert {node["component"] for node in response.a2ui[2]["updateComponents"]["components"]} == {"Column", "Notice"}
