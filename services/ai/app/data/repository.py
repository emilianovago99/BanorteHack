import csv
import json
import sqlite3
import calendar
import os
import time
from copy import deepcopy
from decimal import Decimal, InvalidOperation
from functools import lru_cache, wraps
from threading import RLock
from uuid import uuid4
from pathlib import Path
from app.data.generate import DATA_DIR


def synchronized(method):
    @wraps(method)
    def locked(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)
    return locked


class FinancialRepository:
    def __init__(self, directory: Path = DATA_DIR):
        self._lock = RLock()
        self.directory = Path(directory)
        self.profile_path = self.directory / "profile.json"
        self.payments_path = self.directory / "payments.json"
        self.profile = json.loads(self.profile_path.read_text(encoding="utf-8"))
        self.payments = []
        # The journal is the durable commit record. It restores both balances
        # if the process stopped between the two atomic file replacements.
        if self.payments_path.exists():
            state = json.loads(self.payments_path.read_text(encoding="utf-8"))
            self.profile = state["profile"]
            self.payments = state["payments"]
            if json.loads(self.profile_path.read_text(encoding="utf-8")) != self.profile:
                self._atomic_write(self.profile_path, self.profile)
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("CREATE TABLE transactions (id TEXT PRIMARY KEY, date TEXT, kind TEXT, amount_cents INTEGER, merchant TEXT, category TEXT, account_id TEXT, city TEXT, method TEXT, recurring INTEGER, description TEXT)")
        with (directory / "transactions.csv").open(encoding="utf-8", newline="") as file:
            records = list(csv.DictReader(file))
        self.db.executemany("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)", [tuple(row.values()) for row in records])
        for payment in self.payments:
            self._insert_transaction(payment["row"])
        self.db.execute("CREATE INDEX transactions_period ON transactions(date, kind)")
        self.db.execute("CREATE INDEX transactions_category ON transactions(category, merchant)")
        self.db.commit()

    @synchronized
    def query(self, sql, params=()):
        return [dict(row) for row in self.db.execute(sql, params).fetchall()]

    @synchronized
    def month(self, month=None):
        import re
        selected = month or self.profile["default_month"]
        if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", selected):
            raise ValueError("Mes inválido; usa YYYY-MM.")
        return selected

    @synchronized
    def overview(self, month=None):
        month = self.month(month)
        totals = self.query("SELECT kind, SUM(amount_cents)/100.0 AS total FROM transactions WHERE date LIKE ? GROUP BY kind", (month + "%",))
        totals = {item["kind"]: item["total"] for item in totals}
        net = self.query("SELECT SUM(CASE WHEN kind='income' THEN amount_cents ELSE -amount_cents END) AS net FROM transactions")[0]["net"]
        balance = (self.profile["opening_balance_cents"] + net) / 100
        investments = sum(item["value"] for item in self.profile["investments"])
        debts = sum(item["balance"] for item in self.profile["debts"])
        income, expenses = totals.get("income", 0), totals.get("expense", 0)
        return {"balance": round(balance, 2), "currency": "MXN", "mode": "demo", "synthetic": True, "month": month,
                "income": income, "expenses": expenses, "surplus": round(income - expenses, 2), "savings_rate": round((income - expenses) / income * 100, 1) if income else 0,
                "debt_total": debts, "investments_total": investments, "net_worth": round(balance + investments - debts, 2),
                "dataset": {key: self.profile[key] for key in ("start_date", "end_date", "transaction_count", "profile")},
                "accounts": self.profile["accounts"], "goals": self.profile["goals"]}

    @synchronized
    def cashflow(self, months=6, end_month=None):
        if not 1 <= months <= 36:
            raise ValueError("El rango debe ser de 1 a 36 meses.")
        end = self.month(end_month)
        rows = self.query("SELECT substr(date,1,7) AS month, SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END)/100.0 AS income, SUM(CASE WHEN kind='expense' THEN amount_cents ELSE 0 END)/100.0 AS expenses FROM transactions WHERE substr(date,1,7)<=? GROUP BY month ORDER BY month DESC LIMIT ?", (end, months))
        return {"rows": list(reversed(rows)), "synthetic": True}

    @synchronized
    def transactions(self, month=None, kind=None, category=None, merchant=None, limit=20, offset=0):
        if not 1 <= limit <= 100 or not 0 <= offset <= 50000:
            raise ValueError("Paginación inválida.")
        clauses, values = ["1=1"], []
        if month:
            clauses.append("date LIKE ?"); values.append(self.month(month) + "%")
        if kind:
            if kind not in ("income", "expense"): raise ValueError("Tipo inválido.")
            clauses.append("kind=?"); values.append(kind)
        for field, value in (("category", category), ("merchant", merchant)):
            if value:
                clauses.append(f"{field} LIKE ? ESCAPE '\\'")
                values.append("%" + value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
        where = " AND ".join(clauses)
        total = self.query(f"SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents),0)/100.0 AS amount FROM transactions WHERE {where}", values)[0]
        rows = self.query(f"SELECT *, amount_cents/100.0 AS amount FROM transactions WHERE {where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?", (*values, limit, offset))
        return {"rows": rows, **total, "limit": limit, "offset": offset}

    @synchronized
    def breakdown(self, month=None, group_by="category", kind="expense"):
        if group_by not in ("category", "merchant") or kind not in ("income", "expense"):
            raise ValueError("Agrupación inválida.")
        month = self.month(month)
        rows = self.query(f"SELECT {group_by} AS label, SUM(amount_cents)/100.0 AS amount, COUNT(*) AS count FROM transactions WHERE date LIKE ? AND kind=? GROUP BY {group_by} ORDER BY amount DESC", (month + "%", kind))
        return {"month": month, "rows": rows, "total": round(sum(row["amount"] for row in rows), 2)}

    @synchronized
    def budgets(self, month=None):
        spent = {row["label"]: row["amount"] for row in self.breakdown(month)["rows"]}
        return {"month": self.month(month), "rows": [{"category": key, "budget": value, "spent": spent.get(key, 0), "remaining": round(value-spent.get(key, 0), 2), "percent": round(spent.get(key, 0)/value*100, 1)} for key, value in self.profile["budgets"].items()]}

    @synchronized
    def subscriptions(self, month=None):
        rows = self.query("SELECT merchant, category, MAX(amount_cents)/100.0 AS monthly_amount, COUNT(*) AS count FROM transactions WHERE date LIKE ? AND recurring=1 AND category='Suscripciones' GROUP BY merchant,category ORDER BY monthly_amount DESC", (self.month(month) + "%",))
        total = sum(row["monthly_amount"] for row in rows)
        return {"rows": rows, "monthly_total": round(total, 2), "annual_total": round(total*12, 2)}


    @staticmethod
    def _atomic_write(path, value):
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("w", encoding="utf-8", newline="\n") as file:
                json.dump(value, file, ensure_ascii=False, indent=2, allow_nan=False)
                file.write("\n")
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def _insert_transaction(self, row):
        # Same columns and integer cents as the source CSV, on this connection.
        columns = ("id", "date", "kind", "amount_cents", "merchant", "category",
                   "account_id", "city", "method", "recurring", "description")
        self.db.execute("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        tuple(row[column] for column in columns))

    @synchronized
    def get_debts(self):
        rows = deepcopy(self.profile["debts"])
        return {"rows": rows, "total": sum(row["balance"] for row in rows)}

    @synchronized
    def apply_debt_payment(self, debt_id, extra_payment):
        """One-off demo payment; journal/profile persistence for one MCP process.

        Identical debt/amount retries within 30 seconds return the same receipt.
        The source CSV remains the baseline; journal rows are replayed on startup.
        """
        try:
            amount = Decimal(str(extra_payment))
        except (InvalidOperation, ValueError):
            raise ValueError("Monto de pago inválido.")
        if not amount.is_finite() or not 0 < amount <= 100000 or amount * 100 != (amount * 100).to_integral_value():
            raise ValueError("El pago debe ser positivo, con máximo dos decimales y hasta $100,000.")
        cents = int(amount * 100)
        debt = next((row for row in self.profile["debts"] if row["id"] == debt_id), None)
        if debt is None:
            raise ValueError("Crédito desconocido.")
        now = time.time()
        for payment in reversed(self.payments):
            if payment.get("debt_id") == debt_id and payment["row"]["amount_cents"] == cents and 0 <= now - payment["created_at"] < 30:
                return {**payment["result"], "balance_after": self.overview()["balance"],
                        "debt_after": {"debt_id": debt_id, "balance": debt["balance"]}}
        debt_cents = int(Decimal(str(debt["balance"])) * 100)
        if cents > debt_cents:
            raise ValueError("El abono supera el saldo pendiente del crédito.")
        if amount > Decimal(str(self.overview()["balance"])):
            raise ValueError("Saldo disponible insuficiente.")
        month = self.month()
        year, month_number = map(int, month.split("-"))
        transaction_id = "txn-" + uuid4().hex
        row = {"id": transaction_id, "date": f"{month}-{calendar.monthrange(year, month_number)[1]:02}",
               "kind": "expense", "amount_cents": cents, "merchant": debt["name"],
               "category": "Créditos", "account_id": self.profile["accounts"][0]["id"],
               "city": "Monterrey", "method": "SPEI", "recurring": 0,
               "description": f"Abono único confirmado · {debt_id}"}
        previous_profile = self.profile
        previous_state = {"profile": previous_profile, "payments": self.payments}
        updated_profile = deepcopy(previous_profile)
        updated_debt = next(item for item in updated_profile["debts"] if item["id"] == debt_id)
        updated_debt["balance"] = (debt_cents - cents) / 100
        updated_profile["transaction_count"] += 1
        try:
            # Establish a recovery baseline before changing profile.json.
            if not self.payments_path.exists():
                self._atomic_write(self.payments_path, previous_state)
            with self.db:
                self._insert_transaction(row)
                self.profile = updated_profile
                result = {"transaction_id": transaction_id, "confirmed": True,
                          "balance_after": self.overview()["balance"],
                          "debt_after": {"debt_id": debt_id, "balance": updated_debt["balance"]}}
                payments = [*self.payments, {"debt_id": debt_id, "created_at": now, "row": row, "result": result}]
                self._atomic_write(self.profile_path, updated_profile)
                self._atomic_write(self.payments_path, {"profile": updated_profile, "payments": payments})
        except (OSError, sqlite3.Error):
            self.profile = previous_profile
            # SQLite rolls back. Restore the disk projection as well; the old
            # journal is also sufficient for recovery after a failed write.
            try:
                if self.payments_path.exists():
                    self._atomic_write(self.payments_path, previous_state)
                self._atomic_write(self.profile_path, previous_profile)
            except OSError:
                pass
            raise ValueError("No se pudo guardar el pago. Verifica el almacenamiento e intenta de nuevo.") from None
        self.payments = payments
        return deepcopy(result)

    @synchronized
    def apply_investment(self, plan_id, amount):
        try:
            amount_val = Decimal(str(amount))
        except (InvalidOperation, ValueError):
            raise ValueError("Monto inválido.")
        if not amount_val.is_finite() or not 0 < amount_val <= 1000000 or amount_val * 100 != (amount_val * 100).to_integral_value():
            raise ValueError("El monto debe ser positivo y máximo $1,000,000.")
        if amount_val > Decimal(str(self.overview()["balance"])):
            raise ValueError("Saldo disponible insuficiente.")
        cents = int(amount_val * 100)
        plan_names = {"conservative": "Plan Conservador", "balanced": "Plan Equilibrado", "growth": "Plan Crecimiento"}
        if plan_id not in plan_names:
            raise ValueError("Plan desconocido.")
        now = time.time()
        for payment in reversed(self.payments):
            if payment.get("plan_id") == plan_id and payment["row"]["amount_cents"] == cents and 0 <= now - payment["created_at"] < 30:
                return {**payment["result"], "balance_after": self.overview()["balance"]}
        month = self.month()
        year, month_number = map(int, month.split("-"))
        transaction_id = "txn-" + uuid4().hex
        row = {"id": transaction_id, "date": f"{month}-{calendar.monthrange(year, month_number)[1]:02}",
               "kind": "expense", "amount_cents": cents, "merchant": plan_names[plan_id],
               "category": "Inversiones", "account_id": self.profile["accounts"][0]["id"],
               "city": "Monterrey", "method": "SPEI", "recurring": 0,
               "description": f"Inversión confirmada · {plan_id}"}
        previous_profile = self.profile
        previous_state = {"profile": previous_profile, "payments": self.payments}
        updated_profile = deepcopy(previous_profile)
        investment_entry = next((item for item in updated_profile["investments"] if item.get("id") == plan_id), None)
        if investment_entry:
            investment_entry["value"] += float(amount_val)
        else:
            updated_profile["investments"].append({"id": plan_id, "name": plan_names[plan_id], "value": float(amount_val)})
        updated_profile["transaction_count"] += 1
        try:
            if not self.payments_path.exists():
                self._atomic_write(self.payments_path, previous_state)
            with self.db:
                self._insert_transaction(row)
                self.profile = updated_profile
                result = {"transaction_id": transaction_id, "confirmed": True,
                          "balance_after": self.overview()["balance"]}
                payments = [*self.payments, {"plan_id": plan_id, "created_at": now, "row": row, "result": result}]
                self._atomic_write(self.profile_path, updated_profile)
                self._atomic_write(self.payments_path, {"profile": updated_profile, "payments": payments})
        except (OSError, sqlite3.Error):
            self.profile = previous_profile
            try:
                if self.payments_path.exists():
                    self._atomic_write(self.payments_path, previous_state)
                self._atomic_write(self.profile_path, previous_profile)
            except OSError:
                pass
            raise ValueError("No se pudo guardar la inversión.") from None
        self.payments = payments
        return deepcopy(result)


@lru_cache(maxsize=1)
def repository():
    return FinancialRepository()
