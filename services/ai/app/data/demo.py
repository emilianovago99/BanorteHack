from copy import deepcopy

DATA = {
    "ingresos": {"title": "Ingresos de ejemplo", "labels": ["Jun", "Jul", "Ago"], "values": [18000, 19500, 21000]},
    "deudas": {"title": "Deuda de ejemplo", "labels": ["Jun", "Jul", "Ago"], "values": [8000, 6500, 5000]},
    "inversiones": {"title": "Inversiones de ejemplo", "labels": ["Jun", "Jul", "Ago"], "values": [10000, 10500, 11000]},
}


def financial_summary(domain: str) -> dict:
    return deepcopy(DATA[domain])
