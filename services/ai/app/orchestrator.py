from app.a2ui import Surface, TRANSACTION_COLUMNS, money
from app.schemas import ChatResponse, Visualization, QueryPlan, SimulationInput, DebtInput, ClientAction
from app.planner import plan_query


def response(surface, message, domain, tools, interpretation="local", period=None, simulation=None, transaction=None):
    palette = {"deudas": ["#c2410c", "#dc2626", "#f59e0b"], "ingresos": ["#15803d", "#0d9488", "#65a30d"], "inversiones": ["#2563eb", "#0891b2", "#6366f1", "#64748b"]}.get(domain)
    if palette:
        for node in surface.components:
            if node["component"] == "FinancialChart":
                node.setdefault("palette", palette)
    # Compatibilidad con el cliente móvil anterior mientras se renderiza A2UI.
    chart = next((item for item in surface.components if item["component"] == "FinancialChart"), None)
    data = surface.model[chart["data"]["path"].lstrip("/")] if chart else {"labels": [], "series": [{"values": []}]}
    return ChatResponse(message=message, domain=domain, visualization=Visualization(type=chart["chartType"] if chart else "bar", title=chart["title"] if chart else "Resumen", labels=data["labels"], values=data["series"][0]["values"]), a2ui=surface.finish(), surface_id=surface.id, tools_used=tools.calls, interpretation=interpretation, period=period, simulation=simulation, transaction=transaction)


async def render_plan(plan, tools, interpretation="local"):
    surface = Surface()
    domain, month = plan.intent, plan.month
    if domain in ("fuera_tema", "incomprensible", "sin_datos", "no_disponible", "cuota_agotada"):
        return await query_issue(tools, {"fuera_tema": "out_of_scope", "incomprensible": "not_understood", "sin_datos": "no_data", "no_disponible": "unavailable", "cuota_agotada": "quota"}[domain], interpretation)
    overview = await tools.call("get_account_overview", month=month)
    month = overview["month"]
    if domain in ("resumen", "gastos", "ingresos", "movimientos", "presupuestos", "suscripciones") and not overview["dataset"]["start_date"][:7] <= month <= overview["dataset"]["end_date"][:7]:
        return await query_issue(tools, "no_data", interpretation)
    if domain == "resumen":
        flow = await tools.call("get_cashflow", months=6, end_month=month)
        recent = await tools.call("search_transactions", month=month, limit=8)
        budget = await tools.call("get_budget_status", month=month)
        surface.body += [surface.row(surface.metric("Saldo disponible", overview["balance"], detail="Al cierre del dataset"), surface.metric("Ingresos del mes", overview["income"], tone="positive"), surface.metric("Gastos del mes", overview["expenses"]), surface.metric("Capacidad de ahorro", overview["surplus"], tone="positive" if overview["surplus"] >= 0 else "negative"))]
        surface.body.append(surface.chart("Tu dinero, mes a mes", [row["month"] for row in flow["rows"]], [{"label": "Ingresos", "values": [row["income"] for row in flow["rows"]]}, {"label": "Gastos", "values": [row["expenses"] for row in flow["rows"]]}]))
        surface.body.append(surface.row(surface.node("GoalList", title="Tus metas", data=surface.bind(overview["goals"])), surface.node("BudgetList", title="Presupuestos a seguir", data=surface.bind(sorted(budget["rows"], key=lambda row: row["percent"], reverse=True)[:4]))))
        surface.body.append(surface.table("Últimos movimientos", TRANSACTION_COLUMNS, recent["rows"]))
        message = f"En {month} ingresaron {money(overview['income'])} y salieron {money(overview['expenses'])}. Tu diferencia disponible del mes es {money(overview['surplus'])}."
    elif domain in ("gastos", "ingresos"):
        kind = "income" if domain == "ingresos" else "expense"
        breakdown = await tools.call("get_income_sources" if kind == "income" else "get_spending_breakdown", month=month, **({"group_by": plan.group_by} if kind == "expense" else {}))
        flow = await tools.call("get_cashflow", months=6, end_month=month)
        rows = breakdown["rows"]
        if not rows:
            return await query_issue(tools, "no_data", interpretation)
        label = "Origen de tus ingresos" if kind == "income" else "¿A dónde se fue tu dinero?"
        dimension = "Origen" if kind == "income" else "Comercio" if plan.group_by == "merchant" else "Categoría"
        surface.body.append(surface.row(surface.metric("Ingresos" if kind == "income" else "Gastos", breakdown["total"]), surface.metric("Fuentes" if kind == "income" else "Comercios" if plan.group_by == "merchant" else "Categorías", len(rows), "number"), surface.metric("Ahorro del mes", overview["savings_rate"], "percent")))
        surface.body.append(surface.chart(label, [row["label"] for row in rows], [{"label": "MXN", "values": [row["amount"] for row in rows]}], "doughnut" if kind == "expense" else "bar"))
        surface.body.append(surface.chart("Evolución mensual", [row["month"] for row in flow["rows"]], [{"label": domain.title(), "values": [row["income" if kind == "income" else "expenses"] for row in flow["rows"]]}], "line"))
        surface.body.append(surface.table(label, [{"key": "label", "label": dimension}, {"key": "count", "label": "Movimientos"}, {"key": "amount", "label": "Monto", "format": "currency"}], rows))
        surface.body.append(surface.button("Ver movimientos del mes", "show_transactions", {"month": month, "kind": kind}))
        message = f"En {month}, tus {domain} suman {money(breakdown['total'])}. " + (f"El mayor {'origen' if kind == 'income' else 'destino'} es {rows[0]['label']} con {money(rows[0]['amount'])}." if rows else "No hay movimientos para este periodo.")
    elif domain == "movimientos":
        data = await tools.call("search_transactions", month=month, merchant=plan.merchant, category=plan.category, limit=50)
        if not data["count"]:
            return await query_issue(tools, "no_data", interpretation)
        surface.body += [surface.row(surface.metric("Movimientos encontrados", data["count"], "number"), surface.metric("Monto total encontrado", data["amount"])), surface.table("Detalle de movimientos", TRANSACTION_COLUMNS, data["rows"])]
        surface.body.append(surface.notice(f"Mostrando {len(data['rows'])} de {data['count']} registros. Refina por mes, comercio o categoría desde el chat."))
        message = f"Encontré {data['count']} movimientos en {month}" + (f" para {plan.merchant or plan.category}" if plan.merchant or plan.category else "") + ". Puedes revisar su origen, destino y categoría."
    elif domain == "presupuestos":
        data = await tools.call("get_budget_status", month=month)
        over = [row for row in data["rows"] if row["remaining"] < 0]
        surface.body += [surface.row(surface.metric("Presupuesto mensual", sum(row["budget"] for row in data["rows"])), surface.metric("Categorías excedidas", len(over), "number", "negative" if over else "positive")), surface.node("BudgetList", title="Tu presupuesto por categoría", data=surface.bind(data["rows"]))]
        message = f"Hay {len(over)} categorías por encima de su presupuesto en {month}. Los porcentajes se calculan con cada movimiento del dataset."
    elif domain == "suscripciones":
        data = await tools.call("get_subscriptions", month=month)
        surface.body += [surface.row(surface.metric("Costo mensual", data["monthly_total"]), surface.metric("Costo anualizado", data["annual_total"])), surface.table("Servicios recurrentes", [{"key": "merchant", "label": "Servicio"}, {"key": "monthly_amount", "label": "Mensual", "format": "currency"}], data["rows"])]
        message = f"Tus suscripciones suman {money(data['monthly_total'])} al mes. Si se mantienen, equivalen a {money(data['annual_total'])} al año."
    elif domain == "deudas":
        data = await tools.call("get_debts")
        surface.body.append(surface.row(surface.metric("Deuda total", data["total"]), surface.metric("Pagos mínimos", sum(row["minimum_payment"] for row in data["rows"])), surface.metric("Créditos activos", len(data["rows"]), "number")))
        cards = []
        for debt in data["rows"]:
            cards.append(surface.node("DebtCard", data=surface.bind(debt), action={"event": {"name": "simulate_debt", "context": {"debt_id": debt["id"], "extra_payment": 500}}}))
        surface.body.append(surface.row(*cards))
        message = f"Tu perfil tiene {money(data['total'])} de deuda. Selecciona un crédito para comparar el pago mínimo con un abono adicional de $500 mensuales."
    else:
        data = await tools.call("get_investment_plans", amount=plan.amount)
        surface.body.append(surface.notice(data["debt_notice"]))
        cards = [surface.node("PlanCard", data=surface.bind(item), amount=plan.amount, action={"event": {"name": "select_plan", "context": {"plan_id": item["id"], "amount": plan.amount, "monthly_contribution": plan.monthly_contribution, "months": plan.months}}}) for item in data["plans"]]
        surface.body += [surface.row(*cards), surface.notice(data["assumption"])]
        message = f"Preparé tres escenarios educativos para un capital inicial de {money(plan.amount)}. Elige uno para explorar su proyección y ajustar las aportaciones."
    return response(surface, message, domain, tools, interpretation, period=month)


async def query_issue(tools, reason, interpretation="local"):
    result = await tools.call("report_query_issue", reason=reason)
    surface = Surface()
    surface.body.append(surface.text("Probemos con otra pregunta", "h2"))
    surface.body.append(surface.notice(result["message"]))
    for suggestion in result["suggestions"]:
        surface.body.append(surface.text(suggestion))
    return response(surface, result["message"], "resumen", tools, interpretation)


async def answer(request, tools):
    from app.planner import normalize
    plan, interpretation = await plan_query(request)
    options = {key: getattr(plan, f"view_{key}") for key in ("order", "color", "chart_type", "sort_key", "target") if getattr(plan, f"view_{key}") is not None}
    if plan.intent == "personalizar" and options and request.current_view:
        current = request.current_view.model_copy(deep=True)
        current.transaction = None  # Presentation edits never replay a payment confirmation.
        result = await tools.call("customize_financial_view", messages=current.a2ui, **options)
        current.a2ui = result["a2ui"]
        current.tools_used = tools.calls
        current.interpretation = interpretation
        current.workspace_operation = "create" if any(word in normalize(request.message) for word in ("nueva pestana", "otra pestana", "nueva vista")) else "update"
        current.message = "Actualicé la vista con los ajustes solicitados. El orden se aplica a los registros visibles." if result["changed"] else "No encontré un componente compatible. Puedes indicar el título entre comillas y pedir orden, color o tipo de gráfica."
        # Refresh the compatibility chart used by mobile clients as well.
        model = next(m["updateDataModel"]["value"] for m in current.a2ui if "updateDataModel" in m)
        nodes = next(m["updateComponents"]["components"] for m in current.a2ui if "updateComponents" in m)
        chart = next((n for n in nodes if n["component"] == "FinancialChart"), None)
        if chart:
            data = model[chart["data"]["path"].lstrip("/")]
            current.visualization = Visualization(type=chart["chartType"], title=chart["title"], labels=data["labels"], values=data["series"][0]["values"])
        return current
    if plan.intent == "personalizar":
        return await query_issue(tools, "not_understood", interpretation)
    if plan.intent == "inversiones" and plan.plan_id:
        params = SimulationInput(plan_id=plan.plan_id, amount=plan.amount, months=plan.months, monthly_contribution=plan.monthly_contribution)
        result = await handle_action(ClientAction(name="simulate_investment", surfaceId="chat", sourceComponentId="chat", timestamp="", context=params.model_dump()), tools)
        result.interpretation = interpretation
        return result
    return await render_plan(plan, tools, interpretation)


async def handle_action(action, tools):
    context = action.context
    if action.name in ("select_plan", "simulate_investment"):
        params = SimulationInput.model_validate(context)
        data = await tools.call("project_investment", **params.model_dump())
        surface = Surface()
        surface.body.append(surface.row(surface.metric("Valor proyectado", data["final_value"], tone="positive"), surface.metric("Tus aportaciones", data["contributed"]), surface.metric("Ganancia hipotética", data["estimated_gain"], tone="positive")))
        surface.body.append(surface.node("Simulator", data=surface.bind(params.model_dump()), action={"event": {"name": "simulate_investment", "context": params.model_dump()}}))
        surface.body.append(surface.chart("Así podría evolucionar tu inversión", [f"Mes {row['month']}" for row in data["rows"]], [{"label": label, "values": [row[key] for row in data["rows"]]} for key, label in [("low", "Escenario inferior"), ("base", "Escenario base"), ("high", "Escenario superior"), ("contributed", "Aportaciones")]], "line"))
        surface.body.append(surface.chart("Distribución del plan", [row["label"] for row in data["plan"]["allocation"]], [{"label": "%", "values": [row["value"] for row in data["plan"]["allocation"]]}], "doughnut"))
        surface.body.append(surface.notice(data["assumption"]))
        surface.body.append(surface.button("Comparar otros planes", "compare_plans", {"amount": params.amount}))
        message = f"Con {data['plan']['name']}, el escenario base a {params.months} meses resulta en {money(data['final_value'])}, de los cuales {money(data['contributed'])} son aportaciones. Es una simulación, no una promesa de rendimiento."
        return response(surface, message, "inversiones", tools, simulation=params)
    if action.name == "simulate_debt":
        params = DebtInput.model_validate(context)
        data = await tools.call("simulate_debt_payoff", **params.model_dump())
        surface = Surface()
        surface.body.append(surface.row(surface.metric("Intereses que evitarías", data["interest_saved"], tone="positive"), surface.metric("Meses que adelantas", data["months_saved"], "number"), surface.metric("Nuevo plazo", data["accelerated"]["months"], "number")))
        count = data["baseline"]["months"]
        surface.body.append(surface.chart("Tu deuda hasta llegar a cero", [f"Mes {i+1}" for i in range(count)], [{"label": title, "values": [data[key]["rows"][i]["balance"] if i < len(data[key]["rows"]) else 0 for i in range(count)]} for key, title in [("baseline", "Pago mínimo"), ("accelerated", "Con pago extra")]], "line"))
        surface.body.append(surface.notice("Simulación con tasa constante, sin compras nuevas, comisiones ni cargos adicionales. No se ha realizado ningún pago."))
        if 0 < params.extra_payment <= data["debt"]["balance"]:
            surface.body.append(surface.notice(f"Puedes confirmar ahora un abono único de {money(params.extra_payment)} a {data['debt']['name']}. Descontará ese monto de tu cuenta y de tu deuda de demostración; no programa pagos mensuales."))
            surface.body.append(surface.button(f"Confirmar abono único de {money(params.extra_payment)}", "confirm_debt_payment", params.model_dump()))
        return response(surface, f"En {data['debt']['name']}, añadir {money(params.extra_payment)} al mes reduce el plazo en {data['months_saved']} meses y los intereses en {money(data['interest_saved'])}.", "deudas", tools)
    if action.name == "confirm_debt_payment":
        params = DebtInput.model_validate(context)
        result = await tools.call("confirm_debt_payment", **params.model_dump())
        surface = Surface()
        surface.body.append(surface.text("Pago confirmado", "h2"))
        surface.body.append(surface.row(surface.metric("Saldo disponible", result["balance_after"]), surface.metric("Deuda restante", result["debt_after"]["balance"])))
        surface.body.append(surface.notice(f"Abono único registrado en el perfil de demostración. Folio: {result['transaction_id']}"))
        return response(surface, f"Pago confirmado de {money(params.extra_payment)}. Tu saldo disponible es {money(result['balance_after'])}.", "deudas", tools, transaction=result)
    if action.name == "compare_plans":
        return await render_plan(QueryPlan(intent="inversiones", amount=context.get("amount", 10000)), tools)
    if action.name == "show_transactions":
        # Validar el contexto, nunca usar SQL ni nombres de herramientas del cliente.
        month = QueryPlan(month=context.get("month")).month
        kind = context.get("kind")
        if kind not in (None, "income", "expense"): raise ValueError("Tipo de movimiento inválido.")
        data = await tools.call("search_transactions", month=month, kind=kind, limit=50)
        surface = Surface()
        surface.body += [surface.metric("Movimientos encontrados", data["count"], "number"), surface.table("Movimientos del periodo", TRANSACTION_COLUMNS, data["rows"])]
        return response(surface, f"Estos son los primeros {len(data['rows'])} de {data['count']} movimientos encontrados.", "movimientos", tools, period=month)
    raise ValueError("Acción desconocida.")
