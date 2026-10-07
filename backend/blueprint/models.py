# module-2-ai-interview-agent/blueprint/models.py
from pydantic import BaseModel, Field


class EvaluationExpectation(BaseModel):
    competency: str
    description: str = ""
    min_evidence_strength: str = "moderate"


class InterviewSection(BaseModel):
    title: str
    competencies: list[str]
    time_budget_minutes: int = 10
    expectations: list[EvaluationExpectation] = Field(default_factory=list)


class InterviewBlueprint(BaseModel):
    role: str
    seniority: str = "mid"
    duration_minutes: int = 30
    sections: list[InterviewSection]
    candidate_skills: list[str] = Field(default_factory=list)
    candidate_claims: list[str] = Field(default_factory=list)
