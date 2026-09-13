from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    ai_mode: Literal["auto", "local", "gemini"] = "auto"
    database_url: str = "postgresql://lazy-bank:local-development-only@localhost:5432/lazy-bank"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "lazy-bank"
