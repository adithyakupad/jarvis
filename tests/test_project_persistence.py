"""Deterministic tests for persistent project state."""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.projects import (
    ProjectAlreadyExistsError,
    ProjectCreate,
    ProjectRepository,
    ProjectStatus,
)


FIXED_TIME = datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)


def complete_project() -> ProjectCreate:
    return ProjectCreate(
        id="helios",
        name="Project Helios",
        objective="Build an open-source research platform",
        status=ProjectStatus.ACTIVE,
        current_phase="foundation",
        latest_result="Requirements approved",
        current_blocker="",
        next_action="Build persistent project state",
    )


def test_project_survives_repository_restart(tmp_path: Path) -> None:
    database = tmp_path / "jarvis.db"
    first_repository = ProjectRepository(database, clock=lambda: FIXED_TIME)

    created = first_repository.create(complete_project())

    restarted_repository = ProjectRepository(database)
    retrieved = restarted_repository.get("helios")

    assert retrieved == created
    assert retrieved is not None
    assert retrieved.created_at == FIXED_TIME
    assert retrieved.updated_at == FIXED_TIME
    assert retrieved.status is ProjectStatus.ACTIVE
    assert database.is_file()


def test_unknown_project_returns_none(tmp_path: Path) -> None:
    repository = ProjectRepository(tmp_path / "jarvis.db")

    assert repository.get("missing") is None


def test_duplicate_project_id_is_rejected(tmp_path: Path) -> None:
    repository = ProjectRepository(tmp_path / "jarvis.db", clock=lambda: FIXED_TIME)
    repository.create(complete_project())

    with pytest.raises(ProjectAlreadyExistsError, match="already exists"):
        repository.create(complete_project())


@pytest.mark.parametrize("field", ["id", "name", "objective"])
def test_required_text_fields_reject_empty_values(field: str) -> None:
    values = complete_project().model_dump()
    values[field] = "   "

    with pytest.raises(ValidationError):
        ProjectCreate.model_validate(values)


def test_cli_persists_between_processes(tmp_path: Path) -> None:
    database = tmp_path / "cli.db"
    create_command = [
        sys.executable,
        "-m",
        "app",
        "--database",
        str(database),
        "project",
        "create",
        "--id",
        "helios",
        "--name",
        "Project Helios",
        "--objective",
        "Build an open-source research platform",
        "--current-phase",
        "foundation",
        "--next-action",
        "Build persistent project state",
    ]
    created_process = subprocess.run(
        create_command,
        check=True,
        capture_output=True,
        text=True,
    )
    retrieved_process = subprocess.run(
        [
            sys.executable,
            "-m",
            "app",
            "--database",
            str(database),
            "project",
            "get",
            "helios",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    created = json.loads(created_process.stdout)
    retrieved = json.loads(retrieved_process.stdout)
    assert retrieved == created
    assert retrieved["id"] == "helios"
    assert retrieved["current_phase"] == "foundation"
