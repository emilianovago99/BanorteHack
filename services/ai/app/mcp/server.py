from typing import Literal
from mcp.server.fastmcp import FastMCP
from app.data.demo import financial_summary

mcp = FastMCP("BanorteHack financial data")


@mcp.tool()
def get_financial_summary(domain: Literal["deudas", "ingresos", "inversiones"]) -> dict:
    """Consulta datos financieros ficticios por dominio."""
    return {"mode": "demo", **financial_summary(domain)}


if __name__ == "__main__":
    mcp.run(transport="stdio")
