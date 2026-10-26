"""Every compose service joins only the networks it needs, and every in-cluster call has one.

A bridge network does not filter by port, so a container reaches every port of every container
it shares a network with. `SERVICE_NETWORKS` pins each service's networks, so a new service, or
a service that gains a network, fails here until someone states which nets it needs and why
(deploy/README.md, "Networks", holds the same table). `DIALS` lists every in-cluster hostname a
service calls and who calls it; each caller must share a network with the host it dials, and a
new hostname in config.kdl, dagster.yaml or workspace.yaml must be added to `DIALS`.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import cast

import yaml

REPO = Path(__file__).resolve().parents[2]
COMPOSE = REPO / "deploy" / "docker-compose.yml"
SIGNOZ = REPO / "deploy" / "signoz" / "docker" / "docker-compose.yaml"
CONFIG_KDL = REPO / "ontology" / "ontology-config" / "config.kdl"
DAGSTER_YAML = REPO / "dagster" / "dagster.yaml"
WORKSPACE_YAML = REPO / "dagster" / "workspace.yaml"

DAGSTER = frozenset({"pipeline", "dagster-db"})
TELEMETRY = frozenset({"telemetry"})

# The services in deploy/docker-compose.yml and the networks each joins. The reason for each
# is in deploy/README.md ("Networks") and on the service in the compose file.
SERVICE_NETWORKS: dict[str, frozenset[str]] = {
    "dagster-postgres": frozenset({"dagster-db"}),
    "dagster-code": DAGSTER,
    "dagster-webserver": DAGSTER,
    "dagster-daemon": DAGSTER,
    "weal-postgres": frozenset({"weal-db"}),
    "weal-bot": frozenset({"telemetry", "weal-db", "weal-feed"}),
    "weal-overlay": frozenset({"telemetry", "weal-feed"}),
    "menhir": TELEMETRY,
    "strider": TELEMETRY,
    "akasha-frontend": TELEMETRY,
    "codex": TELEMETRY,
    "mouthpiece-frontend": TELEMETRY,
    "vellum-frontend": TELEMETRY,
    "vellum-render": TELEMETRY,
    "orator-postgres": frozenset({"orator-db"}),
    "orator-backend": frozenset({"telemetry", "orator-db"}),
    "harrow": TELEMETRY,
    "ledger": TELEMETRY,
    "portal": TELEMETRY,
    "portal-headless": TELEMETRY,
}

# Services on no compose network: node-exporter needs the host's netns for its NIC counters,
# smart-exporter only writes a file.
NETWORK_MODE = {"node-exporter": "host", "smart-exporter": "none"}

# The one SigNoz container the astra services reach. Every other SigNoz container (ClickHouse,
# zookeeper, the UI, the migrators) stays on signoz-net alone.
COLLECTOR = "otel-collector"
COLLECTOR_NETWORKS = frozenset({"signoz-net", "telemetry", "pipeline"})

# The Dagster run containers are not compose services: the daemon launches them on the networks
# in the DAGSTER_RUN_NETWORK_* env (dagster.yaml run_launcher). This name stands for them below.
RUN = "<dagster run container>"

# Every in-cluster hostname a service dials, and who dials it. "*otlp" expands to every service
# that exports OTLP from inside a container (each Node app and each Dagster service) plus the
# run containers.
DIALS: dict[str, frozenset[str]] = {
    # config.kdl telemetry.otlp-endpoint, read by libs/{py,ts}/observe when ASTRA_RUNTIME=container.
    "signoz-otel-collector": frozenset({"*otlp"}),
    # dagster.yaml storage.postgres hostname: run, event and schedule storage. The code server
    # opens the instance for sensors; the run containers write their runs and events.
    "dagster-postgres": frozenset({"dagster-code", "dagster-webserver", "dagster-daemon", RUN}),
    # workspace.yaml grpc_server host: the webserver and daemon load the code location.
    "dagster-code": frozenset({"dagster-webserver", "dagster-daemon"}),
    # config.kdl weal.database-url.
    "weal-postgres": frozenset({"weal-bot"}),
    # config.kdl weal.feed-ws-url: weal-bot POSTs each roll to the overlay.
    "weal-overlay": frozenset({"weal-bot"}),
    # config.kdl orator.database-url.
    "orator-postgres": frozenset({"orator-backend"}),
}


Mapping = dict[str, object]


def _map(value: object) -> Mapping:
    assert isinstance(value, dict)
    return cast("Mapping", value)


def _load(path: Path) -> Mapping:
    return _map(yaml.safe_load(path.read_text()))


def _section(path: Path, key: str) -> dict[str, Mapping]:
    return {name: _map(value) for name, value in _map(_load(path)[key]).items()}


def _networks(svc: Mapping) -> frozenset[str]:
    nets = svc.get("networks", [])
    return frozenset(str(n) for n in (nets if isinstance(nets, list) else _map(nets)))


def _astra() -> dict[str, Mapping]:
    return _section(COMPOSE, "services")


def _signoz() -> dict[str, Mapping]:
    return _section(SIGNOZ, "services")


def _membership() -> dict[str, frozenset[str]]:
    """Every compose service, the run containers and every container_name, to their networks."""
    out: dict[str, frozenset[str]] = {}
    for name, svc in {**_signoz(), **_astra()}.items():
        out[name] = _networks(svc)
        if "container_name" in svc:
            out[str(svc["container_name"])] = out[name]
    env = _map(_astra()["dagster-daemon"]["environment"])
    project = _load(COMPOSE)["name"]
    out[RUN] = frozenset(
        str(env[key]).removeprefix(f"{project}_")
        for key in ("DAGSTER_RUN_NETWORK_PIPELINE", "DAGSTER_RUN_NETWORK_DB")
    )
    return out


def _otlp_exporters() -> frozenset[str]:
    out = {RUN}
    for name, svc in _astra().items():
        build = svc.get("build")
        dockerfile = _map(build).get("dockerfile") if build is not None else None
        if dockerfile == "deploy/node.Dockerfile" or svc.get("image") == "astra-dagster:local":
            out.add(name)
    return frozenset(out)


def _subnet(net: Mapping) -> object:
    config = _map(net["ipam"])["config"]
    assert isinstance(config, list)
    return _map(config[0])["subnet"]


def test_every_service_declares_exactly_its_networks() -> None:
    services = _astra()
    assert set(services) == set(SERVICE_NETWORKS) | set(NETWORK_MODE), (
        "a compose service was added or removed: add it to SERVICE_NETWORKS (or NETWORK_MODE) "
        "with only the networks it needs, and to deploy/README.md's network table"
    )
    for name, want in SERVICE_NETWORKS.items():
        assert _networks(services[name]) == want, name
        assert "network_mode" not in services[name], name
    for name, mode in NETWORK_MODE.items():
        assert services[name].get("network_mode") == mode, name
        assert "networks" not in services[name], name


def test_only_the_collector_bridges_signoz_and_the_astra_nets() -> None:
    signoz = _signoz()
    assert _networks(signoz[COLLECTOR]) == COLLECTOR_NETWORKS
    for name, svc in signoz.items():
        if name != COLLECTOR:
            assert _networks(svc) <= {"signoz-net"}, name
    for name, nets in SERVICE_NETWORKS.items():
        assert "signoz-net" not in nets, name


def test_every_network_is_pinned_and_used() -> None:
    declared = _section(COMPOSE, "networks")
    used = set().union(*SERVICE_NETWORKS.values(), COLLECTOR_NETWORKS)
    assert set(declared) == used
    subnets = [_subnet(net) for net in declared.values()]
    assert len(subnets) == len(set(subnets))
    # dagster-db carries no outbound traffic and no published port.
    assert declared["dagster-db"].get("internal") is True
    # The vendored SigNoz file declares the nets its collector joins; they must match.
    for name, net in _section(SIGNOZ, "networks").items():
        assert net == declared[name], name


def test_every_caller_shares_a_network_with_the_host_it_dials() -> None:
    members = _membership()
    for host, callers in DIALS.items():
        expanded = set(callers - {"*otlp"})
        if "*otlp" in callers:
            expanded |= _otlp_exporters()
        for caller in sorted(expanded):
            assert members[caller] & members[host], f"{caller} cannot reach {host}"


def test_every_in_cluster_hostname_in_config_is_listed_in_dials() -> None:
    """A new `<service>:<port>` in config.kdl or the Dagster yaml is a new edge to review."""
    names = set(_membership()) - {RUN}
    text = "\n".join(p.read_text() for p in (CONFIG_KDL, DAGSTER_YAML, WORKSPACE_YAML))
    found = set(re.findall(r"[/@]([a-z0-9-]+):\d+", text))
    found |= set(re.findall(r"^\s*(?:hostname|host):\s*([a-z0-9-]+)\s*$", text, re.M))
    assert found & names == set(DIALS)
