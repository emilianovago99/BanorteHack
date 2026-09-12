import csv
import json
import sqlite3
from functools import lru_cache
from pathlib import Path
from app.data.generate import DATA_DIR


class FinancialRepository:
    def __init__(self, directory: Path = DATA_DIR):
        self.profile = json.loads((directory / "profile.json").read_text(encoding="utf-8"))
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("CREATE TABLE transactions (id TEXT PRIMARY KEY, date TEXT, kind TEXT, amount_cents INTEGER, merchant TEXT, category TEXT, account_id TEXT, city TEXT, method TEXT, recurring INTEGER, description TEXT)")
        with (directory / "transactions.csv").open(encoding="utf-8", newline="") as file:
            records = list(csv.DictReader(file))
        self.db.executemany("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)", [tuple(row.values()) for row in records])
        self.db.execute("CREATE INDEX transactions_period ON transactions(date, kind)")
        self.db.execute("CREATE INDEX transactions_category ON transactions(category, merchant)")
        self.db.commit()

    def query(self, sql, params=()):
        return [dict(row) for row in self.db.execute(sql, params).fetchall()]

    def month(self, month=None):
        import re
        selected = month or self.profile["default_month"]
        if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", selected):
            raise ValueError("Mes inválido; usa YYYY-MM.")
        return selected

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

    def cashflow(self, months=6, end_month=None):
        if not 1 <= months <= 36:
            raise ValueError("El rango debe ser de 1 a 36 meses.")
        end = self.month(end_month)
        rows = self.query("SELECT substr(date,1,7) AS month, SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END)/100.0 AS income, SUM(CASE WHEN kind='expense' THEN amount_cents ELSE 0 END)/100.0 AS expenses FROM transactions WHERE substr(date,1,7)<=? GROUP BY month ORDER BY month DESC LIMIT ?", (end, months))
        return {"rows": list(reversed(rows)), "synthetic": True}

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

    def breakdown(self, month=None, group_by="category", kind="expense"):
        if group_by not in ("category", "merchant") or kind not in ("income", "expense"):
            raise ValueError("Agrupación inválida.")
        month = self.month(month)
        rows = self.query(f"SELECT {group_by} AS label, SUM(amount_cents)/100.0 AS amount, COUNT(*) AS count FROM transactions WHERE date LIKE ? AND kind=? GROUP BY {group_by} ORDER BY amount DESC", (month + "%", kind))
        return {"month": month, "rows": rows, "total": round(sum(row["amount"] for row in rows), 2)}

    def budgets(self, month=None):
        spent = {row["label"]: row["amount"] for row in self.breakdown(month)["rows"]}
        return {"month": self.month(month), "rows": [{"category": key, "budget": value, "spent": spent.get(key, 0), "remaining": round(value-spent.get(key, 0), 2), "percent": round(spent.get(key, 0)/value*100, 1)} for key, value in self.profile["budgets"].items()]}

    def subscriptions(self, month=None):
        rows = self.query("SELECT merchant, category, MAX(amount_cents)/100.0 AS monthly_amount, COUNT(*) AS count FROM transactions WHERE date LIKE ? AND recurring=1 AND category='Suscripciones' GROUP BY merchant,category ORDER BY monthly_amount DESC", (self.month(month) + "%",))
        total = sum(row["monthly_amount"] for row in rows)
        return {"rows": rows, "monthly_total": round(total, 2), "annual_total": round(total*12, 2)}


@lru_cache(maxsize=1)
def repository():
    return FinancialRepository()
