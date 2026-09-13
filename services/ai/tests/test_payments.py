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


def action_from(view, node):
    return {"version": "v0.9", "action": {**node["action"]["event"], "surfaceId": view["surface_id"],
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
    button = next(node for node in nodes if node.get("action", {}).get("event", {}).get("name") == "confirm_debt_payment")
    action = action_from(simulation, button)
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
    first = repo.apply_debt_payment("laptop", 8400)
    assert first["debt_after"]["balance"] == 0
    second = repo.apply_debt_payment("card-classic", 500)
    retry = repo.apply_debt_payment("laptop", 8400)
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
