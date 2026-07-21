"""Minimal command-line interface for JARVIS project state."""

import argparse
import json
from pathlib import Path
from typing import Sequence

from pydantic import ValidationError

from app.projects import (
    ProjectAlreadyExistsError,
    ProjectCreate,
    ProjectRepository,
    ProjectStatus,
)


def build_parser() -> argparse.ArgumentParser:
    """Build the JARVIS command-line parser."""

    parser = argparse.ArgumentParser(prog="jarvis")
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("data/jarvis.db"),
        help="SQLite database path (default: data/jarvis.db)",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    project = commands.add_parser("project", help="Manage projects")
    project_commands = project.add_subparsers(dest="project_command", required=True)

    create = project_commands.add_parser("create", help="Create a project")
    create.add_argument("--id", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--objective", required=True)
    create.add_argument(
        "--status",
        choices=[status.value for status in ProjectStatus],
        default=ProjectStatus.ACTIVE.value,
    )
    create.add_argument("--current-phase", default="")
    create.add_argument("--latest-result", default="")
    create.add_argument("--current-blocker", default="")
    create.add_argument("--next-action", default="")

    get = project_commands.add_parser("get", help="Get a project")
    get.add_argument("id")
    return parser


def _print_json(value: object) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def main(argv: Sequence[str] | None = None) -> int:
    """Run the JARVIS command-line interface."""

    parser = build_parser()
    args = parser.parse_args(argv)
    repository = ProjectRepository(args.database)

    try:
        if args.project_command == "create":
            project = repository.create(
                ProjectCreate(
                    id=args.id,
                    name=args.name,
                    objective=args.objective,
                    status=args.status,
                    current_phase=args.current_phase,
                    latest_result=args.latest_result,
                    current_blocker=args.current_blocker,
                    next_action=args.next_action,
                )
            )
        else:
            project = repository.get(args.id)
            if project is None:
                parser.error(f"project '{args.id}' was not found")
    except (ProjectAlreadyExistsError, ValidationError, ValueError) as error:
        parser.error(str(error))

    _print_json(project.model_dump(mode="json"))
    return 0
