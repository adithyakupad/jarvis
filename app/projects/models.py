"""Project models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, field_validator


class ProjectStatus(str, Enum):
    """Allowed project lifecycle states."""

    ACTIVE = "active"
    BLOCKED = "blocked"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ProjectCreate(BaseModel):
    """Validated input for creating a project."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    objective: str
    status: ProjectStatus = ProjectStatus.ACTIVE
    current_phase: str = ""
    latest_result: str = ""
    current_blocker: str = ""
    next_action: str = ""

    @field_validator("id", "name", "objective")
    @classmethod
    def require_non_empty(cls, value: str) -> str:
        """Reject empty identifiers and core descriptions."""

        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be empty")
        return normalized


class Project(ProjectCreate):
    """A complete project record loaded from persistent storage."""

    created_at: datetime
    updated_at: datetime
