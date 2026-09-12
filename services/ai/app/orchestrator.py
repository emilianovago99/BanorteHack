import unicodedata
from app.data.demo import financial_summary
from app.schemas import ChatResponse, FinancialDomain, Visualization


def classify_intent(message: str) -> FinancialDomain:
    text = "".join(char for char in unicodedata.normalize("NFD", message.lower()) if not unicodedata.combining(char))
    if any(word in text for word in ("deuda", "pagar", "credito", "prestamo")):
        return "deudas"
    if any(word in text for word in ("invert", "inversion", "ahorro", "rendimiento")):
        return "inversiones"
    return "ingresos"


def answer(message: str) -> ChatResponse:
    domain = classify_intent(message)
    return ChatResponse(
        message=f"Estos son tus datos ficticios de {domain}. Esta demo usa reglas locales; las proyecciones con Gemini se integrarán después.",
        domain=domain,
        visualization=Visualization(**financial_summary(domain)),
    )
