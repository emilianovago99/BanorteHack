import math
from app.data.repository import repository

PLANS = [
    {"id": "conservative", "name": "Paso seguro", "risk": "Bajo", "annual_rate": .05, "description": "Escenario de liquidez y estabilidad.", "allocation": [{"label": "Renta fija demo", "value": 80}, {"label": "Liquidez demo", "value": 20}]},
    {"id": "balanced", "name": "Equilibrio", "risk": "Medio", "annual_rate": .08, "description": "Escenario con mezcla de activos y horizonte de varios años.", "allocation": [{"label": "Renta fija demo", "value": 50}, {"label": "Renta variable demo", "value": 40}, {"label": "Liquidez demo", "value": 10}]},
    {"id": "growth", "name": "Horizonte", "risk": "Alto", "annual_rate": .11, "description": "Escenario con mayor variación y posibilidad de pérdidas.", "allocation": [{"label": "Renta variable demo", "value": 75}, {"label": "Renta fija demo", "value": 15}, {"label": "Liquidez demo", "value": 10}]},
]


def investment_plans(amount=10000):
    if not math.isfinite(amount) or not 100 <= amount <= 1_000_000:
        raise ValueError("El monto debe estar entre 100 y 1,000,000 MXN.")
    return {"plans": PLANS, "amount": amount, "assumption": "Planes educativos. Tasas hipotéticas, no cotizaciones ni rendimientos garantizados.", "debt_notice": "El perfil tiene deuda con tasas de 22% y 36%: compara amortizarla antes de comprometer dinero a inversiones."}


def simulate_investment(plan_id, amount=10000, monthly_contribution=1000, months=24):
    plan = next((item for item in PLANS if item["id"] == plan_id), None)
    if not plan: raise ValueError("Plan desconocido.")
    if not all(math.isfinite(value) for value in (amount, monthly_contribution)) or not 100 <= amount <= 1_000_000 or not 0 <= monthly_contribution <= 100000 or not 1 <= months <= 120:
        raise ValueError("Parámetros de simulación fuera de rango.")
    annual_rates = [plan["annual_rate"] - .06, plan["annual_rate"], plan["annual_rate"] + .04]
    balances = [amount] * 3
    rows = [{"month": 0, "contributed": amount, "low": amount, "base": amount, "high": amount}]
    for month in range(1, months + 1):
        balances = [value * (1 + rate) ** (1 / 12) + monthly_contribution for value, rate in zip(balances, annual_rates)]
        rows.append({"month": month, "contributed": amount + monthly_contribution*month, **dict(zip(("low", "base", "high"), [round(value, 2) for value in balances]))})
    final = rows[-1]
    return {"plan": plan, "amount": amount, "monthly_contribution": monthly_contribution, "months": months,
            "rows": rows, "final_value": final["base"], "contributed": final["contributed"], "estimated_gain": round(final["base"]-final["contributed"], 2),
            "assumption": "Capitalización mensual con aportaciones al final de mes. Escenarios ilustrativos, no intervalos de confianza; no incluyen comisiones, impuestos ni inflación. Puedes perder capital."}


def debt_payoff(debt_id, extra_payment=500):
    debt = next((item for item in repository().profile["debts"] if item["id"] == debt_id), None)
    if not debt: raise ValueError("Crédito desconocido.")
    if not math.isfinite(extra_payment) or not 0 <= extra_payment <= 100000: raise ValueError("Pago extra inválido.")

    def schedule(extra):
        balance, interest_total, rows = debt["balance"], 0, []
        for month in range(1, 601):
            interest = balance * debt["annual_rate"] / 12
            payment = min(balance + interest, debt["minimum_payment"] + extra)
            if payment <= interest: raise ValueError("El pago no cubre los intereses.")
            balance = max(0, balance + interest - payment)
            interest_total += interest
            rows.append({"month": month, "balance": round(balance, 2), "payment": round(payment, 2)})
            if balance < .005: break
        return {"months": len(rows), "interest": round(interest_total, 2), "rows": rows}
    baseline, accelerated = schedule(0), schedule(extra_payment)
    return {"debt": debt, "extra_payment": extra_payment, "baseline": baseline, "accelerated": accelerated,
            "interest_saved": round(baseline["interest"]-accelerated["interest"], 2), "months_saved": baseline["months"]-accelerated["months"]}
