from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

FinancialDomain = Literal["deudas", "ingresos", "inversiones"]


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=2000)


class Visualization(BaseModel):
    type: Literal["bar"] = "bar"
    title: str
    labels: list[str]
    values: list[float]


class ChatResponse(BaseModel):
    message: str
    domain: FinancialDomain
    mode: Literal["demo"] = "demo"
    visualization: Visualization
