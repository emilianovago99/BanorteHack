from typing import Literal
from mcp.server.fastmcp import FastMCP
from app.data.repository import repository
from app.data.simulations import investment_plans, simulate_investment, debt_payoff

mcp = FastMCP("BanorteHack Financial Intelligence")


@mcp.tool()
def get_account_overview(month: str | None = None) -> dict:
    """Saldo, ingresos, gastos y patrimonio del dataset sintético. Mes YYYY-MM."""
    return repository().overview(month)


@mcp.tool()
def get_cashflow(months: int = 6, end_month: str | None = None) -> dict:
    """Evolución de ingresos y gastos, de 1 a 36 meses."""
    return repository().cashflow(months, end_month)


@mcp.tool()
def search_transactions(month: str | None = None, kind: Literal["income", "expense"] | None = None, category: str | None = None, merchant: str | None = None, limit: int = 20, offset: int = 0) -> dict:
    """Busca movimientos por mes, origen/destino, comercio, categoría y tipo; incluye totales."""
    return repository().transactions(month, kind, category, merchant, limit, offset)


@mcp.tool()
def get_spending_breakdown(month: str | None = None, group_by: Literal["category", "merchant"] = "category") -> dict:
    """Distribución de gastos por categoría o comercio."""
    return repository().breakdown(month, group_by)


@mcp.tool()
def get_income_sources(month: str | None = None) -> dict:
    """Origen de ingresos: nómina, proyectos y bonos."""
    return repository().breakdown(month, "merchant", "income")


@mcp.tool()
def get_budget_status(month: str | None = None) -> dict:
    """Compara gastos contra presupuesto, incluyendo excesos."""
    return repository().budgets(month)


@mcp.tool()
def get_debts() -> dict:
    """Créditos: saldo, tasa anual, pago mínimo, límite y vencimiento."""
    return repository().get_debts()


@mcp.tool()
def simulate_debt_payoff(debt_id: str, extra_payment: float = 500) -> dict:
    """Compara pagos mínimos contra abonos adicionales. No efectúa pagos."""
    return debt_payoff(debt_id, extra_payment)


@mcp.tool()
def confirm_debt_payment(debt_id: str, extra_payment: float) -> dict:
    """Confirma un abono único: registra el egreso y reduce la deuda en el dataset de demostración. Requiere confirmación explícita del usuario."""
    return repository().apply_debt_payment(debt_id, extra_payment)


@mcp.tool()
def get_investment_plans(amount: float = 10000) -> dict:
    """Tres planes educativos con riesgo y tasas hipotéticas."""
    return investment_plans(amount)


@mcp.tool()
def project_investment(plan_id: str, amount: float = 10000, monthly_contribution: float = 1000, months: int = 24) -> dict:
    """Proyección de aportaciones y escenarios. No invierte ni mueve dinero."""
    return simulate_investment(plan_id, amount, monthly_contribution, months)


@mcp.tool()
def get_subscriptions(month: str | None = None) -> dict:
    """Suscripciones y costo mensual/anualizado."""
    return repository().subscriptions(month)


@mcp.tool()
def customize_financial_view(messages: list[dict], order: Literal["asc", "desc"] | None = None, color: str | None = None, chart_type: Literal["bar", "line", "doughnut"] | None = None, sort_key: str | None = None, target: str | None = None) -> dict:
    """Adjust ordering, chart type or palette of the active financial surface without changing amounts."""
    import re
    from app.presentation import customize_surface, PALETTES
    if color and color not in PALETTES and not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        raise ValueError("Color inválido")
    return customize_surface(messages, order, color, chart_type, sort_key, target)


@mcp.tool()
def report_query_issue(reason: Literal["not_understood", "out_of_scope", "no_data", "unavailable", "quota"]) -> dict:
    """Devuelve una aclaración y ejemplos cuando no se entiende la consulta o no se puede obtener información. No inventa datos."""
    messages = {
        "not_understood": "No entendí lo que necesitas. Puedes preguntar por tus ingresos, gastos, deudas o inversiones.",
        "out_of_scope": "No puedo resolver esa consulta con este perfil financiero. Puedo ayudarte a revisar tus finanzas del dataset.",
        "no_data": "No encontré datos para esa consulta. El dataset cubre enero de 2024 a agosto de 2026; prueba otro periodo o comercio.",
        "unavailable": "No pude conseguir la información en este momento. Intenta de nuevo en unos instantes.",
        "quota": "Gemini alcanzó el límite de solicitudes de este proyecto. No pude interpretar tu consulta con IA. Intenta cuando se restablezca la cuota."
    }
    return {"reason": reason, "message": messages[reason], "suggestions": ["Revisar deudas", "Analizar gastos de agosto de 2026", "Explorar inversiones"]}


if __name__ == "__main__":
    mcp.run(transport="stdio")
