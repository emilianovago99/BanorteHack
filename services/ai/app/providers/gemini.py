from app.config import Settings


def create_model():
    """Intérprete de consultas. Los importes proceden de herramientas MCP."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    settings = Settings()
    if not settings.gemini_api_key:
        raise RuntimeError("Configura GEMINI_API_KEY para usar Gemini.")
    return ChatGoogleGenerativeAI(model=settings.gemini_model, api_key=settings.gemini_api_key, max_retries=0, timeout=12)
