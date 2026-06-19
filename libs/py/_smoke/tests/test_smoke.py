from astra_smoke import ping


def test_ping() -> None:
    assert ping() == "pong"
