import csv
from decimal import Decimal
import pytest
from app.data.repository import FinancialRepository
from app.data.generate import DATA_DIR
from app.data.simulations import simulate_investment, debt_payoff



@pytest.fixture(scope="module")
def repo(tmp_path_factory):
    import shutil
    directory = tmp_path_factory.mktemp("financial-data")
    for name in ("profile.json", "transactions.csv"):
        shutil.copyfile(DATA_DIR / name, directory / name)
    instance = FinancialRepository(directory)
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr("app.data.simulations.repository", lambda: instance)
        try:
            yield instance
        finally:
            instance.db.close()


def test_totals_match_source_csv(repo):
    with (repo.directory / "transactions.csv").open(encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    assert len(rows) > 10000
    overview = repo.overview()
    for kind, field in [("income", "income"), ("expense", "expenses")]:
        cents = sum(int(row["amount_cents"]) for row in rows if row["date"].startswith(overview["month"]) and row["kind"] == kind)
        assert Decimal(str(overview[field])) == Decimal(cents) / 100


def test_filters_and_empty_period(repo):
    data = repo.transactions(month="2026-08", merchant="Café", kind="expense")
    assert data["count"] > 0
    assert all("Café" in row["merchant"] for row in data["rows"])
    assert repo.transactions(merchant="' OR 1=1 --")["count"] == 0
    assert repo.breakdown("2030-01")["rows"] == []


def test_investment_compounding_and_contributions():
    result = simulate_investment("balanced", amount=10000, monthly_contribution=0, months=12)
    assert result["final_value"] == pytest.approx(10800, abs=.01)
    with_contributions = simulate_investment("balanced", amount=10000, monthly_contribution=2000, months=12)
    assert with_contributions["contributed"] == 34000
    assert with_contributions["final_value"] > 34000
    assert with_contributions["rows"][-1]["low"] < with_contributions["final_value"]
    with pytest.raises(ValueError): simulate_investment("unknown")
    with pytest.raises(ValueError): simulate_investment("balanced", amount=float('nan'))


def test_extra_debt_payment_reduces_interest_and_months(repo):
    result = debt_payoff("card-classic", 500)
    assert result["months_saved"] > 0
    assert result["interest_saved"] > 0
    assert result["accelerated"]["rows"][-1]["balance"] == 0
    assert debt_payoff("laptop", 500)["interest_saved"] == 0
