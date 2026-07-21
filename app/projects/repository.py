"""SQLite persistence for projects."""

import sqlite3
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from app.projects.models import Project, ProjectCreate


class ProjectAlreadyExistsError(ValueError):
    """Raised when a project ID is already stored."""


def utc_now() -> datetime:
    """Return the current timezone-aware UTC time."""

    return datetime.now(timezone.utc)


class ProjectRepository:
    """Create and retrieve projects in a SQLite database."""

    def __init__(
        self,
        database_path: str | Path,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.database_path = Path(database_path)
        self._clock = clock
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    status TEXT NOT NULL,
                    current_phase TEXT NOT NULL,
                    latest_result TEXT NOT NULL,
                    current_blocker TEXT NOT NULL,
                    next_action TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def create(self, project: ProjectCreate) -> Project:
        """Persist and return a new project."""

        timestamp = self._clock()
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        timestamp = timestamp.astimezone(timezone.utc)

        stored = Project(
            **project.model_dump(),
            created_at=timestamp,
            updated_at=timestamp,
        )

        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO projects (
                        id,
                        name,
                        objective,
                        status,
                        current_phase,
                        latest_result,
                        current_blocker,
                        next_action,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        stored.id,
                        stored.name,
                        stored.objective,
                        stored.status.value,
                        stored.current_phase,
                        stored.latest_result,
                        stored.current_blocker,
                        stored.next_action,
                        stored.created_at.isoformat(),
                        stored.updated_at.isoformat(),
                    ),
                )
        except sqlite3.IntegrityError as error:
            raise ProjectAlreadyExistsError(
                f"project '{project.id}' already exists"
            ) from error

        return stored

    def get(self, project_id: str) -> Project | None:
        """Return a project by ID, or None when it is not stored."""

        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    objective,
                    status,
                    current_phase,
                    latest_result,
                    current_blocker,
                    next_action,
                    created_at,
                    updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()

        if row is None:
            return None
        return Project.model_validate(dict(row))
