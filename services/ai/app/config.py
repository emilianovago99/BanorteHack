from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    database_url: str = "postgresql://banortehack:local-development-only@localhost:5432/banortehack"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "banortehack"
