"""Dataset sintético reproducible. No contiene datos personales ni bancarios reales."""
import calendar
import csv
import json
import random
import os
from pathlib import Path

DATA_DIR = Path(os.environ["FINANCIAL_DATA_DIR"]) if os.environ.get("FINANCIAL_DATA_DIR") else Path(__file__).resolve().parents[4] / "datasets" / "synthetic"


def generate(destination: Path = DATA_DIR):
    rng = random.Random(20260912)
    destination.mkdir(parents=True, exist_ok=True)
    merchants = [
        ("Alimentos", "Café del Parque", 25, 85), ("Alimentos", "Taquería El Norte", 35, 120),
        ("Supermercado", "Mercado Central", 30, 160), ("Supermercado", "Súper Barrio", 35, 190),
        ("Transporte", "Metro Monterrey", 8, 20), ("Transporte", "Movilidad Urbana", 30, 100),
        ("Compras", "Tienda Digital", 25, 200), ("Salud", "Farmacia del Valle", 25, 130),
        ("Entretenimiento", "Cine Alameda", 35, 120), ("Educación", "Librería Horizonte", 25, 100),
        ("Mascotas", "Mundo Mascota", 20, 90), ("Alimentos", "Panadería Aurora", 15, 55),
    ]
    rows = []

    def add(day, kind, merchant, category, amount, recurring=False, account="checking"):
        rows.append({"id": f"TX-{len(rows)+1:06}", "date": day, "kind": kind, "amount_cents": round(amount * 100),
                     "merchant": merchant, "category": category, "account_id": account,
                     "city": "Monterrey", "method": "SPEI" if kind == "income" or recurring else "Tarjeta de débito",
                     "recurring": int(recurring), "description": f"{category} · {merchant}"})

    for year in (2024, 2025, 2026):
        for month in range(1, 13 if year < 2026 else 9):
            prefix = f"{year}-{month:02}"
            salary = 34000 + (year - 2024) * 2200
            add(f"{prefix}-15", "income", "Norte Digital · nómina", "Nómina", salary / 2, True)
            add(f"{prefix}-28", "income", "Norte Digital · nómina", "Nómina", salary / 2, True)
            add(f"{prefix}-22", "income", "Estudio Horizonte · proyecto", "Freelance", rng.randint(5500, 11500))
            if month in (6, 12):
                add(f"{prefix}-10", "income", "Norte Digital · bono", "Bonos", 8000)
            for day, merchant, category, amount in [
                (1, "Residencial Encino", "Vivienda", 8200 + (year - 2024) * 300),
                (4, "Internet Hogar", "Servicios", 549), (7, "Energía del Norte", "Servicios", rng.randint(450, 950)),
                (8, "Agua y Drenaje", "Servicios", 210), (10, "Telefonía Móvil", "Servicios", 399),
                (12, "Video Plus", "Suscripciones", 249), (14, "Música Premium", "Suscripciones", 129),
                (18, "Almacenamiento Cloud", "Suscripciones", 49), (20, "Gimnasio Activo", "Salud", 599),
                (5, "Crédito Personal · cuota", "Créditos", 2100), (25, "Tarjeta Clásica · pago", "Créditos", 1800),
            ]:
                add(f"{prefix}-{day:02}", "expense", merchant, category, amount, True)
            # Microcompras intencionalmente numerosas para búsquedas y agregaciones.
            for day in range(1, calendar.monthrange(year, month)[1] + 1):
                for _ in range(rng.randint(9, 14)):
                    category, merchant, low, high = rng.choice(merchants)
                    amount = rng.randint(low * 100, high * 100) / 100
                    # Gastos pequeños, un perfil con margen de ahorro moderado.
                    add(f"{prefix}-{day:02}", "expense", merchant, category, amount * .45)
    rows.sort(key=lambda item: (item["date"], item["id"]))
    with (destination / "transactions.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    metadata = {
        "synthetic": True, "seed": 20260912, "profile": "Alex · perfil de demostración", "currency": "MXN",
        "start_date": "2024-01-01", "end_date": "2026-08-31", "default_month": "2026-08", "transaction_count": len(rows),
        "opening_balance_cents": 4200000,
        "accounts": [{"id": "checking", "name": "Cuenta de uso diario", "type": "Débito", "last4": "4821"}],
        "budgets": {"Alimentos": 3500, "Supermercado": 2800, "Transporte": 1800, "Compras": 1800, "Entretenimiento": 1200, "Salud": 1600, "Educación": 1200, "Mascotas": 800, "Suscripciones": 450, "Vivienda": 9000, "Servicios": 1900, "Créditos": 3900},
        "debts": [
            {"id": "card-classic", "name": "Tarjeta Clásica", "balance": 24500, "annual_rate": .36, "minimum_payment": 1800, "due_day": 25, "credit_limit": 60000},
            {"id": "personal-loan", "name": "Crédito personal", "balance": 48000, "annual_rate": .22, "minimum_payment": 2100, "due_day": 5, "credit_limit": 90000},
            {"id": "laptop", "name": "Laptop · meses sin intereses", "balance": 8400, "annual_rate": 0, "minimum_payment": 1400, "due_day": 18, "credit_limit": 16800},
            {"id": "auto-loan", "name": "Crédito Automotriz", "balance": 68000, "annual_rate": .145, "minimum_payment": 3500, "due_day": 12, "credit_limit": 180000},
        ],
        "investments": [{"name": "Fondo de liquidez demo", "value": 28000, "principal": 26000}, {"name": "Portafolio diversificado demo", "value": 46000, "principal": 42000}],
        "goals": [{"name": "Fondo de emergencia", "saved": 28000, "target": 90000}, {"name": "Próximo viaje", "saved": 12000, "target": 35000}],
    }
    # La obligación de la laptop nace al cierre y se paga a partir de septiembre.
    (destination / "profile.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Dataset sintético: {len(rows)} movimientos, {metadata['start_date']} a {metadata['end_date']}")


if __name__ == "__main__":
    generate()
