"""Toolsets for pydantic-deep agents."""

# Re-export from pydantic-ai-todo
from pydantic_ai_todo import create_todo_toolset as TodoToolset

# Re-export console toolset from pydantic-ai-backend
from pydantic_ai_backends import (
    ConsoleDeps,
    create_console_toolset,
    get_console_system_prompt,
)

from pydantic_deep.toolsets.skills import SkillsToolset
from pydantic_deep.toolsets.subagents import SubAgentToolset

__all__ = [
    "TodoToolset",
    "create_console_toolset",
    "get_console_system_prompt",
    "ConsoleDeps",
    "SubAgentToolset",
    "SkillsToolset",
]
