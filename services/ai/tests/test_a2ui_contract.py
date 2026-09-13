import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from app.a2ui_validation import validate_contract
from app.schemas import ClientAction, ChatResponse
from app.a2ui import Surface

ROOT = Path(__file__).resolve().parents[3]
CASES = json.loads((ROOT / "packages/contracts/tests/fixtures.json").read_text(encoding="utf-8"))

@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_shared_contract(case):
    def validate():
        validate_contract(case["kind"], case["value"])
        if case["kind"] == "event":
            ClientAction(**case["value"], surfaceId="test", sourceComponentId="test", timestamp="")
    if case["valid"]:
        validate()
    else:
        with pytest.raises(ValueError):
            validate()

def test_omitted_payment_context_rejected():
    with pytest.raises(ValidationError):
        ClientAction(name="confirm_debt_payment", surfaceId="test", sourceComponentId="test", timestamp="")

def test_surface_rejects_missing_card_action_before_response():
    surface = Surface()
    surface.body.append(surface.node("DebtCard", data=surface.bind({"id": "laptop"})))
    with pytest.raises(ValueError):
        surface.finish()

def test_surface_rejects_action_for_different_debt():
    surface = Surface()
    surface.body.append(surface.node("DebtCard", data=surface.bind({"id": "card-classic"}),
        transactionalAction={"label": "Confirmar", "kind": "mutation", "event": {
            "name": "confirm_debt_payment", "context": {"debt_id": "laptop", "extra_payment": 500}}}))
    with pytest.raises(ValueError, match="tarjeta"):
        surface.finish()

def test_registry_covers_contract_events():
    from app.orchestrator import ACTION_TOOLS
    from app.a2ui_validation import CONTRACT
    names = {branch["properties"]["name"]["const"] for branch in CONTRACT["event"]["oneOf"]}
    assert names == set(ACTION_TOOLS)
