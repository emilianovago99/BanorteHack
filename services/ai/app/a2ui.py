"""Mensajes A2UI v0.9 con catálogo financiero propio y datos separados de la UI."""
from uuid import uuid4

CATALOG_ID = "banortehack:finance-v1"


class Surface:
    def __init__(self):
        self.id = "finance-" + uuid4().hex[:16]
        self.components = []
        self.model = {}
        self.body = []

    def node(self, component, **props):
        node_id = f"node-{len(self.components)+1}"
        self.components.append({"id": node_id, "component": component, **props})
        return node_id

    def bind(self, data):
        key = f"value{len(self.model)}"
        self.model[key] = data
        return {"path": "/" + key}

    def text(self, text, variant="body"):
        return self.node("Text", text=text, variant=variant)

    def metric(self, label, value, format="currency", tone="neutral", detail=""):
        return self.node("Metric", label=label, value=value, format=format, tone=tone, detail=detail)

    def row(self, *children):
        return self.node("Row", children=list(children))

    def chart(self, title, labels, series, chart_type="bar"):
        return self.node("FinancialChart", title=title, chartType=chart_type, data=self.bind({"labels": labels, "series": series}))

    def table(self, title, columns, rows):
        return self.node("DataTable", title=title, columns=columns, data=self.bind(rows))

    def button(self, text, name, context):
        return self.node("Button", text=text, action={"event": {"name": name, "context": context}})

    def notice(self, text):
        return self.node("Notice", text=text)

    def finish(self):
        return [
            {"version": "v0.9", "createSurface": {"surfaceId": self.id, "catalogId": CATALOG_ID}},
            {"version": "v0.9", "updateDataModel": {"surfaceId": self.id, "path": "/", "value": self.model}},
            {"version": "v0.9", "updateComponents": {"surfaceId": self.id, "components": [{"id": "root", "component": "Column", "children": self.body}, *self.components]}},
        ]


def money(value):
    return f"${value:,.2f} MXN"


TRANSACTION_COLUMNS = [{"key": "date", "label": "Fecha"}, {"key": "merchant", "label": "Origen / destino"}, {"key": "category", "label": "Categoría"}, {"key": "kind", "label": "Tipo"}, {"key": "amount", "label": "Monto", "format": "currency"}]
