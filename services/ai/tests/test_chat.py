import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.mark.parametrize("message,domain", [("Mi crédito", "deudas"), ("Quiero invertir", "inversiones"), ("Mi nómina", "ingresos")])
def test_chat_domains(message, domain):
    response = client.post("/chat", json={"message": message})
    assert response.status_code == 200
    body = response.json()
    assert body["domain"] == domain
    assert body["mode"] == "demo"
    assert len(body["visualization"]["labels"]) == len(body["visualization"]["values"])


@pytest.mark.parametrize("message", ["", "   ", "x" * 2001])
def test_invalid_messages(message):
    assert client.post("/chat", json={"message": message}).status_code == 422
