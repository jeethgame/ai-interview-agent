"""
Configuration models for interview sessions, decoupled from database models.
"""

import enum

from pydantic import BaseModel


class InterviewStyle(enum.Enum):
    """
    Enumeration of available interview styles.
    """
    FORMAL = "formal"
    CASUAL = "casual"
    AGGRESSIVE = "aggressive"
    TECHNICAL = "technical"

class SessionConfig(BaseModel):
    """
    Configuration for a single interview session.
    Used by agents to understand the context and parameters of the interview.
    """
    job_role: str = "General Role"
    job_description: str | None = None
    resume_content: str | None = None
    style: InterviewStyle = InterviewStyle.FORMAL
    difficulty: str = "medium"
    target_question_count: int | None = 15  # Fallback for question-based interviews
    company_name: str | None = None
    interview_duration_minutes: int | None = 10  # Default to 10-minute interviews
    use_time_based_interview: bool = True  # Enable time-based interviews by default
