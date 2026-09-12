"""Bounded presentation edits: preserve data and change only catalog properties."""
from copy import deepcopy
import re
from app.planner import normalize

PALETTES = {"azul": ["#2563eb", "#0891b2", "#6366f1"], "verde": ["#15803d", "#0d9488", "#65a30d"], "rojo": ["#dc0030", "#be123c", "#ea580c"], "morado": ["#7c3aed", "#a855f7", "#6366f1"], "naranja": ["#c2410c", "#d97706", "#b45309"]}

def presentation_options(message):
    text = normalize(message)
    options = {}
    if any(term in text for term in ("ascendente", "menor a mayor")): options["order"] = "asc"
    if any(term in text for term in ("descendente", "mayor a menor")): options["order"] = "desc"
    for color in PALETTES:
        if color in text: options["color"] = color
    custom = re.search(r"#[0-9a-f]{6}\b", text)
    if custom: options["color"] = custom.group()
    for word, kind in [("barras", "bar"), ("lineas", "line"), ("dona", "doughnut"), ("circular", "doughnut")]:
        if word in text: options["chart_type"] = kind
    for word, key in [("fecha", "date"), ("monto", "amount"), ("nombre", "label"), ("comercio", "merchant"), ("categoria", "category")]:
        if word in text: options["sort_key"] = key
    if '"' in message:
        match = re.search(r'"([^"\n]{1,100})"', message)
        if match: options["target"] = match.group(1)
    if not any(key in options for key in ("order", "color", "chart_type")): return {}
    return options

def customize_surface(messages, order=None, color=None, chart_type=None, sort_key=None, target=None):
    result = deepcopy(messages)
    model = next(m["updateDataModel"]["value"] for m in result if "updateDataModel" in m)
    nodes = next(m["updateComponents"]["components"] for m in result if "updateComponents" in m)
    changed = 0
    for node in nodes:
        if target and normalize(target) not in normalize(node.get("title", "")): continue
        data = model.get(node.get("data", {}).get("path", "").lstrip("/"))
        kind = node["component"]
        if kind == "FinancialChart":
            if color:
                node["palette"] = PALETTES.get(color, [color])
                changed += 1
            if chart_type:
                node["chartType"] = chart_type
                changed += 1
            if order and data and data.get("series"):
                # Keep all series aligned with their labels.
                indices = sorted(range(len(data["labels"])), key=lambda i: data["labels"][i] if sort_key in ("date", "label", "merchant", "category") else data["series"][0]["values"][i], reverse=order == "desc")
                data["labels"] = [data["labels"][i] for i in indices]
                for series in data["series"]: series["values"] = [series["values"][i] for i in indices]
                changed += 1
        if order and kind in ("DataTable", "BudgetList", "GoalList") and isinstance(data, list) and data:
            key = sort_key or next((key for key in ("amount", "monthly_amount", "spent", "saved") if key in data[0]), "label")
            if key in data[0]:
                data.sort(key=lambda row: row[key], reverse=order == "desc")
                changed += 1
    return {"a2ui": result, "changed": changed}
