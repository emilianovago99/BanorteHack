"""Payment tests always use copies: never mutate the checked-in demo profile."""
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from app.data.repository import FinancialRepository

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def data_dir(tmp_path):
    for name in ("profile.json", "transactions.csv"):
        shutil.copyfile(ROOT / "datasets" / "synthetic" / name, tmp_path / name)
    # These scenarios require an open laptop credit, even after demo users pay it off.
    profile_path = tmp_path / "profile.json"
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    next(debt for debt in profile["debts"] if debt["id"] == "laptop")["balance"] = 8400
    profile_path.write_text(json.dumps(profile), encoding="utf-8")
    return tmp_path


@pytest.fixture
def repo(data_dir):
    repository = FinancialRepository(data_dir)
    yield repository
    repository.db.close()


def test_payment_reconciles_account_debt_and_persists_after_restart(repo, data_dir):
    before = repo.overview()
    debt_before = repo.get_debts()["rows"][0]["balance"]
    result = repo.apply_debt_payment("card-classic", 500.25)
    assert result["confirmed"] is True
    assert result["balance_after"] == pytest.approx(before["balance"] - 500.25)
    assert result["debt_after"] == {"debt_id": "card-classic", "balance": debt_before - 500.25}
    assert repo.overview()["expenses"] == pytest.approx(before["expenses"] + 500.25)
    assert repo.overview()["dataset"]["transaction_count"] == before["dataset"]["transaction_count"] + 1
    row = repo.query("SELECT * FROM transactions WHERE id=?", (result["transaction_id"],))[0]
    assert row["kind"] == "expense" and row["amount_cents"] == 50025
    assert row["date"] == "2026-08-31" and row["recurring"] == 0
    assert json.loads((data_dir / "profile.json").read_text(encoding="utf-8"))["debts"][0]["balance"] == debt_before - 500.25
    restarted = FinancialRepository(data_dir)
    try:
        assert restarted.overview() == repo.overview()
        assert restarted.get_debts() == repo.get_debts()
        assert restarted.apply_debt_payment("card-classic", 500.25) == result
    finally:
        restarted.db.close()


def test_concurrent_duplicate_confirmation_has_one_effect(repo):
    before = repo.overview()["balance"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: repo.apply_debt_payment("card-classic", 500), range(2)))
    assert results[0] == results[1]
    assert repo.overview()["balance"] == before - 500
    assert len(repo.payments) == 1


@pytest.mark.parametrize("amount", [0, -1, .001, 100001, float("nan"), float("inf"), True])
def test_invalid_amount_never_changes_data(repo, data_dir, amount):
    before = repo.overview()
    with pytest.raises(ValueError):
        repo.apply_debt_payment("card-classic", amount)
    assert repo.overview() == before
    assert not (data_dir / "payments.json").exists()


@pytest.mark.parametrize("debt_id,amount", [("unknown", 500), ("laptop", 9000)])
def test_unknown_debt_and_overpayment_rejected(repo, debt_id, amount):
    before = repo.overview()
    with pytest.raises(ValueError):
        repo.apply_debt_payment(debt_id, amount)
    assert repo.overview() == before


def test_insufficient_funds_rejected(repo):
    repo.profile["opening_balance_cents"] -= int(repo.overview()["balance"] * 100)
    before = repo.overview()
    with pytest.raises(ValueError, match="insuficiente"):
        repo.apply_debt_payment("card-classic", 500)
    assert repo.overview() == before


@pytest.mark.parametrize("failed_file", ["profile.json", "payments.json"])
def test_storage_failure_rolls_back_account_and_debt(repo, data_dir, monkeypatch, failed_file):
    before = repo.overview()
    profile = (data_dir / "profile.json").read_bytes()
    # Establish the baseline; then fail a write containing a new payment.
    repo._atomic_write(repo.payments_path, {"profile": repo.profile, "payments": []})
    write = repo._atomic_write
    def fail(path, value):
        if path.name == failed_file and (value.get("payments") or value.get("transaction_count", 0) > before["dataset"]["transaction_count"]):
            raise OSError("injected storage failure")
        write(path, value)
    monkeypatch.setattr(repo, "_atomic_write", fail)
    with pytest.raises(ValueError, match="guardar"):
        repo.apply_debt_payment("card-classic", 500)
    assert repo.overview() == before
    assert json.loads((data_dir / "profile.json").read_bytes()) == json.loads(profile)
    restarted = FinancialRepository(data_dir)
    try:
        assert restarted.overview() == before
    finally:
        restarted.db.close()


def test_journal_recovers_profile_projection(repo, data_dir):
    original = (data_dir / "profile.json").read_bytes()
    receipt = repo.apply_debt_payment("laptop", 500)
    # Simulate an interrupted/stale projection; journal remains authoritative.
    (data_dir / "profile.json").write_bytes(original)
    restarted = FinancialRepository(data_dir)
    try:
        assert restarted.overview()["balance"] == receipt["balance_after"]
        assert restarted.get_debts()["rows"][2]["balance"] == receipt["debt_after"]["balance"]
        assert json.loads((data_dir / "profile.json").read_text(encoding="utf-8")) == restarted.profile
    finally:
        restarted.db.close()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def gateway(data_dir):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is required for the full gateway integration test")
    ai_port, api_port = free_port(), free_port()
    while api_port == ai_port:
        api_port = free_port()
    ai_url, api_url = f"http://127.0.0.1:{ai_port}", f"http://127.0.0.1:{api_port}"
    env = {**os.environ, "FINANCIAL_DATA_DIR": str(data_dir), "AI_MODE": "local", "AUTH_MODE": "demo",
           "AI_SERVICE_URL": ai_url, "HOST": "127.0.0.1", "PORT": str(api_port)}
    processes = []
    try:
        for command, url in [([sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", "services/ai", "--port", str(ai_port)], ai_url),
                             ([node, "services/api/src/index.js"], api_url)]:
            process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            processes.append(process)
            deadline = time.monotonic() + 25
            with httpx.Client(timeout=.5, trust_env=False) as client:
                while time.monotonic() < deadline:
                    assert process.poll() is None, "Test service exited during startup"
                    try:
                        if client.get(url + "/health").status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(.1)
                else:
                    pytest.fail("Test service did not become ready")
        with httpx.Client(base_url=api_url, timeout=30, trust_env=False) as client:
            yield client
    finally:
        for process in reversed(processes):
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def action_from(view, node, closing=False):
    return {"version": "v0.9", "action": {**node["transactionalAction" if closing else "action"]["event"], "surfaceId": view["surface_id"],
            "sourceComponentId": node["id"], "timestamp": "2026-08-31T12:00:00Z"}}


def test_gateway_simulate_confirm_mcp_and_reconcile(gateway, data_dir):
    from jsonschema import Draft202012Validator
    validator = Draft202012Validator(json.loads((ROOT / "packages/visual-engine/catalog.json").read_text(encoding="utf-8")))
    before = gateway.get("/api/account").json()
    debts = gateway.post("/api/chat", json={"message": "Mis deudas"}).json()
    card = next(node for node in debts["a2ui"][2]["updateComponents"]["components"] if node["component"] == "DebtCard")
    simulation = gateway.post("/api/actions", json=action_from(debts, card))
    assert simulation.status_code == 200
    simulation = simulation.json()
    assert simulation["transaction"] is None
    assert gateway.get("/api/account").json()["balance"] == before["balance"]
    nodes = simulation["a2ui"][2]["updateComponents"]["components"]
    for node in nodes:
        validator.validate(node)
    button = next(node for node in nodes if node.get("transactionalAction", {}).get("event", {}).get("name") == "confirm_debt_payment")
    action = action_from(simulation, button, closing=True)
    confirmed = gateway.post("/api/actions", json=action)
    assert confirmed.status_code == 200
    confirmed = confirmed.json()
    result = confirmed["transaction"]
    assert confirmed["tools_used"] == ["confirm_debt_payment"]
    assert result["confirmed"] is True
    assert result["balance_after"] == before["balance"] - 500
    assert gateway.get("/api/account").json()["balance"] == result["balance_after"]
    duplicate = gateway.post("/api/actions", json=action).json()["transaction"]
    assert duplicate == result
    updated = gateway.post("/api/chat", json={"message": "Mis deudas"}).json()
    models = updated["a2ui"][1]["updateDataModel"]["value"].values()
    debt = next(value for value in models if isinstance(value, dict) and value.get("id") == "card-classic")
    assert debt["balance"] == result["debt_after"]["balance"]
    assert json.loads((data_dir / "profile.json").read_text(encoding="utf-8"))["debts"][0]["balance"] == debt["balance"]
    # A client-provided receipt must not become a new confirmation on a UI edit.
    custom = gateway.post("/api/chat", json={"message": "En color azul", "current_view": confirmed}).json()
    assert custom["transaction"] is None
    for context in ({"debt_id": "card-classic", "extra_payment": 0}, {"debt_id": "unknown", "extra_payment": 500}, {"debt_id": "laptop", "extra_payment": 9000}):
        invalid = {**action, "action": {**action["action"], "context": context}}
        assert gateway.post("/api/actions", json=invalid).status_code == 400
    assert gateway.get("/api/account").json()["balance"] == result["balance_after"]
    assert gateway.post("/api/transactions").status_code == 501


def test_full_payoff_and_retry_use_current_balance(repo):
    balance = next(row["balance"] for row in repo.get_debts()["rows"] if row["id"] == "laptop")
    first = repo.apply_debt_payment("laptop", balance)
    assert first["debt_after"]["balance"] == 0
    second = repo.apply_debt_payment("card-classic", 500)
    retry = repo.apply_debt_payment("laptop", balance)
    assert retry["transaction_id"] == first["transaction_id"]
    assert retry["balance_after"] == second["balance_after"]
    assert retry["debt_after"]["balance"] == 0
    assert len(repo.payments) == 2


def test_identical_payment_allowed_after_dedup_window(repo, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr("app.data.repository.time.time", lambda: clock[0])
    first = repo.apply_debt_payment("card-classic", 500)
    clock[0] += 31
    second = repo.apply_debt_payment("card-classic", 500)
    assert second["transaction_id"] != first["transaction_id"]
    assert second["balance_after"] == first["balance_after"] - 500


def test_investment_accepts_legacy_holdings_and_debt_payment_afterward(repo, data_dir):
    from copy import deepcopy
    legacy = deepcopy(repo.profile["investments"])
    assert any("id" not in item for item in legacy)
    before = repo.overview()["balance"]
    investment = repo.apply_investment("conservative", 100)
    assert investment["balance_after"] == pytest.approx(before - 100)
    assert [item for item in repo.profile["investments"] if item.get("id") != "conservative"] == [item for item in legacy if item.get("id") != "conservative"]
    position = next(item for item in repo.profile["investments"] if item.get("id") == "conservative")
    assert position["value"] >= 100
    assert repo.apply_investment("conservative", 100)["transaction_id"] == investment["transaction_id"]

    payment = repo.apply_debt_payment("card-classic", 100)
    assert payment["balance_after"] == pytest.approx(before - 200)
    assert repo.apply_debt_payment("card-classic", 100)["transaction_id"] == payment["transaction_id"]
    assert len(repo.payments) == 2

    restarted = FinancialRepository(data_dir)
    try:
        assert restarted.overview()["balance"] == pytest.approx(before - 200)
        assert restarted.profile["investments"] == repo.profile["investments"]
        assert restarted.apply_debt_payment("card-classic", 100)["transaction_id"] == payment["transaction_id"]
    finally:
        restarted.db.close()


@pytest.mark.parametrize("plan", ["conservative", "balanced", "growth"])
def test_investment_debits_cash_credits_holdings_and_persists(repo, data_dir, plan):
    before = repo.overview()
    receipt = repo.apply_investment(plan, 1250.25, operation_id="investment-1")
    after = repo.overview()
    assert receipt["confirmed"] is True
    assert receipt["balance_after"] == pytest.approx(before["balance"] - 1250.25)
    assert after["investments_total"] == pytest.approx(before["investments_total"] + 1250.25)
    assert after["net_worth"] == pytest.approx(before["net_worth"])
    restarted = FinancialRepository(data_dir)
    try:
        assert restarted.overview() == after
        assert restarted.apply_investment(plan, 1250.25, operation_id="investment-1") == receipt
    finally:
        restarted.db.close()


@pytest.mark.parametrize("kind", ["investment", "payment"])
def test_distinct_confirmations_move_money_but_retries_do_not(repo, data_dir, monkeypatch, kind):
    clock = [1000.0]
    monkeypatch.setattr("app.data.repository.time.time", lambda: clock[0])
    method, target = (repo.apply_investment, "balanced") if kind == "investment" else (repo.apply_debt_payment, "card-classic")
    before = repo.overview()["balance"]
    first = method(target, 100, operation_id="operation-1")
    second = method(target, 100, operation_id="operation-2")
    assert first["transaction_id"] != second["transaction_id"]
    assert second["balance_after"] == pytest.approx(before - 200)
    clock[0] += 60
    assert method(target, 100, operation_id="operation-1")["transaction_id"] == first["transaction_id"]
    assert repo.overview()["balance"] == pytest.approx(before - 200)
    with pytest.raises(ValueError, match="otros parámetros"):
        method(target, 200, operation_id="operation-1")
    assert len(repo.payments) == 2


def test_investment_retry_after_using_entire_balance_is_successful(repo):
    before = repo.overview()["balance"]
    receipt = repo.apply_investment("balanced", before, operation_id="all-cash")
    assert receipt["balance_after"] == 0
    assert repo.apply_investment("balanced", before, operation_id="all-cash") == receipt
    with pytest.raises(ValueError, match="insuficiente"):
        repo.apply_investment("balanced", 100, operation_id="new-investment")
    assert repo.overview()["balance"] == 0
    assert len(repo.payments) == 1


@pytest.mark.parametrize("failed_file", ["profile.json", "payments.json"])
def test_failed_investment_does_not_change_cash_or_holdings(repo, data_dir, monkeypatch, failed_file):
    before = repo.overview()
    repo._atomic_write(repo.payments_path, {"profile": repo.profile, "payments": []})
    write = repo._atomic_write
    def fail(path, value):
        if path.name == failed_file and (value.get("payments") or value.get("transaction_count", 0) > before["dataset"]["transaction_count"]):
            raise OSError("injected storage failure")
        write(path, value)
    monkeypatch.setattr(repo, "_atomic_write", fail)
    with pytest.raises(ValueError, match="guardar"):
        repo.apply_investment("balanced", 100, operation_id="failed")
    assert repo.overview() == before
    restarted = FinancialRepository(data_dir)
    try:
        assert restarted.overview() == before
    finally:
        restarted.db.close()


def test_gateway_simulation_and_two_separate_investments(gateway):
    before = gateway.get("/api/account").json()["balance"]
    receipts = []
    for _ in range(2):
        view = gateway.post("/api/chat", json={"message": "Quiero invertir $100"}).json()
        card = next(node for node in view["a2ui"][2]["updateComponents"]["components"] if node["component"] == "PlanCard")
        simulation = gateway.post("/api/actions", json=action_from(view, card)).json()
        assert simulation["transaction"] is None
        assert gateway.get("/api/account").json()["balance"] == before - 100 * len(receipts)
        simulator = next(node for node in simulation["a2ui"][2]["updateComponents"]["components"] if node["component"] == "Simulator")
        action = action_from(simulation, simulator, closing=True)
        confirmed = gateway.post("/api/actions", json=action)
        assert confirmed.status_code == 200, confirmed.text
        receipts.append(confirmed.json()["transaction"])
        # Browser/network retry of this confirmation returns the same operation.
        assert gateway.post("/api/actions", json=action).json()["transaction"] == receipts[-1]
    assert receipts[0]["transaction_id"] != receipts[1]["transaction_id"]
    assert gateway.get("/api/account").json()["balance"] == before - 200


def test_gateway_investment_then_debt_payload_executes_mutations(gateway, data_dir):
    before = gateway.get("/api/account").json()["balance"]
    view_response = gateway.post("/api/chat", json={"message": "Quiero invertir $100"})
    assert view_response.status_code == 200
    view = view_response.json()
    card = next(node for node in view["a2ui"][2]["updateComponents"]["components"] if node["component"] == "PlanCard")
    action = action_from(view, card, closing=True)
    # Support a card that first opens a projection before presenting confirmation.
    if action["action"]["name"] == "select_plan":
        selected = gateway.post("/api/actions", json=action)
        assert selected.status_code == 200
        view = selected.json()
        card = next(node for node in view["a2ui"][2]["updateComponents"]["components"]
                    if node.get("transactionalAction", {}).get("event", {}).get("name") == "confirm_investment")
        action = action_from(view, card, closing=True)
    assert action["action"]["name"] == "confirm_investment"
    assert action["action"]["context"]["amount"] == 100
    confirmed = gateway.post("/api/actions", json=action)
    assert confirmed.status_code == 200, confirmed.text
    receipt = confirmed.json()["transaction"]
    assert receipt["confirmed"] is True
    assert receipt["debt_after"] is None
    assert receipt["balance_after"] == pytest.approx(before - 100)
    assert gateway.get("/api/account").json()["balance"] == pytest.approx(before - 100)

    debts = gateway.post("/api/chat", json={"message": "Mis deudas"}).json()
    card = next(node for node in debts["a2ui"][2]["updateComponents"]["components"] if node["component"] == "DebtCard")
    payment_action = action_from(debts, card, closing=True)
    payment_action["action"]["context"]["extra_payment"] = 100
    paid = gateway.post("/api/actions", json=payment_action)
    assert paid.status_code == 200, paid.text
    assert paid.json()["transaction"]["balance_after"] == pytest.approx(before - 200)
    journal = json.loads((data_dir / "payments.json").read_text(encoding="utf-8"))["payments"]
    assert len(journal) == 2
    assert journal[0]["plan_id"] == action["action"]["context"]["plan_id"]
    assert journal[1]["debt_id"] == payment_action["action"]["context"]["debt_id"]


def test_demo_four_debts_and_payoff_receipt(gateway):
    view = gateway.post("/api/chat", json={"message": "Mis deudas"}).json()
    nodes = view["a2ui"][2]["updateComponents"]["components"]
    cards = [node for node in nodes if node["component"] == "DebtCard"]
    assert len(cards) == 4
    card = next(node for node in cards if node["transactionalAction"]["event"]["context"]["debt_id"] == "laptop")
    action = action_from(view, card, closing=True)
    action["action"]["context"]["extra_payment"] = 8400
    paid = gateway.post("/api/actions", json=action)
    assert paid.status_code == 200, paid.text
    receipt_nodes = paid.json()["a2ui"][2]["updateComponents"]["components"]
    column = next(node for node in receipt_nodes if node.get("variant") == "confirmation")
    close = next(node for node in receipt_nodes if node.get("text") == "Aceptar")
    assert close["id"] in column["children"]
    assert close["action"]["event"] == {"name": "return_to_zero", "context": {}}
    updated = gateway.post("/api/chat", json={"message": "Mis deudas"}).json()
    nodes = updated["a2ui"][2]["updateComponents"]["components"]
    assert len([node for node in nodes if node["component"] == "DebtCard"]) == 3
    metric = next(node for node in nodes if node.get("label") == "Créditos activos")
    assert metric["value"] == 3
