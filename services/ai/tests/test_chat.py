import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client():
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
