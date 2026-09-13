"""Runtime validation uses JSON Schema generated from the shared Zod contract."""
import json
from pathlib import Path
from decimal import Decimal
from jsonschema import Draft202012Validator, validators
from jsonschema.exceptions import ValidationError

CONTRACT = json.loads(Path(__file__).with_name("a2ui_contract.json").read_text(encoding="utf-8"))
def decimal_multiple(validator, multiple, value, schema):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if Decimal(str(value)) % Decimal(str(multiple)) != 0:
            yield ValidationError("El importe debe tener como máximo dos decimales.")

ContractValidator = validators.extend(Draft202012Validator, {"multipleOf": decimal_multiple})
VALIDATORS = {key: ContractValidator(value) for key, value in CONTRACT.items()}

def validate_contract(kind, value):
    try:
        json.dumps(value, allow_nan=False)
        VALIDATORS[kind].validate(value)
    except (ValidationError, ValueError, TypeError) as exc:
        raise ValueError(f"Contrato A2UI inválido ({kind}): {exc}") from exc
    return value

def validate_surface(messages):
    if not 1 <= len(messages) <= 12:
        raise ValueError("Cantidad de mensajes A2UI inválida.")
    surface_id, nodes, model = None, {}, {}
    for message in messages:
        validate_contract("message", message)
        if "createSurface" in message:
            if surface_id is not None:
                raise ValueError("Superficie duplicada.")
            surface_id = message["createSurface"]["surfaceId"]
        else:
            content = message.get("updateComponents", message.get("updateDataModel"))
            if surface_id is None or content["surfaceId"] != surface_id:
                raise ValueError("Superficie inválida.")
            if "updateComponents" in message:
                for node in content["components"]:
                    if node["id"] in nodes:
                        raise ValueError("Componente duplicado.")
                    nodes[node["id"]] = node
            else:
                model = content["value"]
    def visit(node_id, parents):
        if node_id in parents or len(parents) > 20 or node_id not in nodes:
            raise ValueError("Árbol A2UI inválido.")
        node = nodes[node_id]
        if "data" in node:
            value = model
            for part in node["data"]["path"][1:].split("/"):
                part = part.replace("~1", "/").replace("~0", "~")
                if part in ("__proto__", "constructor", "prototype") or not isinstance(value, dict) or part not in value:
                    raise ValueError("Binding A2UI inválido.")
                value = value[part]
            closing = node.get("transactionalAction")
            if closing and node["component"] in ("PlanCard", "DebtCard"):
                key = "plan_id" if node["component"] == "PlanCard" else "debt_id"
                if not isinstance(value, dict) or value.get("id") != closing["event"]["context"][key]:
                    raise ValueError("La acción no corresponde a la tarjeta.")
        for child in node.get("children", []):
            visit(child, [*parents, node_id])
    visit("root", [])
    return messages
