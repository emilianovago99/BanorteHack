from __future__ import annotations
from typing import Literal, ClassVar
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator

FinancialDomain = Literal["resumen", "deudas", "ingresos", "gastos", "inversiones", "presupuestos", "movimientos", "suscripciones", "clarificacion"]
PlanIntent = Literal["resumen", "deudas", "ingresos", "gastos", "inversiones", "presupuestos", "movimientos", "suscripciones", "fuera_tema", "incomprensible", "sin_datos", "no_disponible", "cuota_agotada", "personalizar", "clarificacion"]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)
    current_view: ChatResponse | None = None
    simulation: SimulationInput | None = None


class QueryPlan(BaseModel):
    intent: PlanIntent = "resumen"
    month: str | None = Field(default=None, pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")
    merchant: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=60)
    group_by: Literal["category", "merchant"] = "category"
    plan_id: Literal["conservative", "balanced", "growth"] | None = None
    view_order: Literal["asc", "desc"] | None = None
    view_color: str | None = Field(default=None, pattern=r"^(azul|verde|rojo|morado|naranja|#[0-9a-fA-F]{6})$")
    view_chart_type: Literal["bar", "line", "doughnut"] | None = None
    view_sort_key: Literal["date", "amount", "label", "merchant", "category"] | None = None
    view_target: str | None = Field(default=None, max_length=100)
    amount: float = Field(default=10000, ge=100, le=1000000)
    months: int = Field(default=24, ge=1, le=120)
    monthly_contribution: float = Field(default=1000, ge=0, le=100000)


class Visualization(BaseModel):
    type: Literal["bar", "line", "doughnut"] = "bar"
    title: str
    labels: list[str]
    values: list[float]


class TransactionResult(BaseModel):
    transaction_id: str
    confirmed: bool
    balance_after: float
    debt_after: dict | None = None


class ChatResponse(BaseModel):
    message: str
    domain: FinancialDomain
    mode: Literal["demo"] = "demo"
    visualization: Visualization
    a2ui: list[dict]

    @field_validator("a2ui")
    @classmethod
    def valid_surface(cls, value):
        from app.a2ui_validation import validate_surface
        return validate_surface(value)

    surface_id: str
    transaction: TransactionResult | None = None
    workspace_operation: Literal["create", "update"] = "create"
    tools_used: list[str] = Field(default_factory=list)
    interpretation: Literal["gemini", "local", "unavailable"] = "local"
    source: str = "Dataset sintético · 2024–2026"
    period: str | None = None
    simulation: SimulationInput | None = None


class ClientAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Literal["select_plan", "simulate_investment", "compare_plans", "simulate_debt", "show_transactions", "confirm_debt_payment"]
    surfaceId: str = Field(max_length=100)
    sourceComponentId: str = Field(max_length=100)
    timestamp: str = Field(max_length=60)
    context: dict

    @field_validator("context")
    @classmethod
    def valid_context(cls, value, info):
        from app.a2ui_validation import validate_contract
        if "name" in info.data:
            validate_contract("event", {"name": info.data["name"], "context": value})
        return value



class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["v0.9"] = "v0.9"
    action: ClientAction


class ContractInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_name: ClassVar[str]

    @model_validator(mode="before")
    @classmethod
    def valid_contract(cls, value):
        from app.a2ui_validation import validate_contract
        if isinstance(value, cls):
            value = value.model_dump()
        validate_contract("event", {"name": cls.event_name, "context": value})
        return value


class SimulationInput(ContractInput):
    event_name = "simulate_investment"
    model_config = ConfigDict(extra="forbid")
    plan_id: Literal["conservative", "balanced", "growth"]
    amount: float = Field(default=10000, ge=100, le=1000000)
    monthly_contribution: float = Field(default=1000, ge=0, le=100000)
    months: int = Field(default=24, ge=1, le=120)


class DebtInput(ContractInput):
    event_name = "simulate_debt"
    model_config = ConfigDict(extra="forbid")
    debt_id: Literal["card-classic", "personal-loan", "laptop"]
    extra_payment: float = Field(default=500, ge=0, le=100000)


class PaymentInput(ContractInput):
    event_name = "confirm_debt_payment"
    debt_id: Literal["card-classic", "personal-loan", "laptop"]
    extra_payment: float = Field(gt=0, le=100000, allow_inf_nan=False)
