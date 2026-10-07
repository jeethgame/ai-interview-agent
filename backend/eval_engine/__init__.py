"""
Eval engine — V2 quantitative scoring.
Runs alongside agentic_coach.py qualitative evaluation.
"""

from .coaching import CoachingCard
from .narrative import generate_narrative
from .prep_list import PrepItem, generate_prep_list
from .readiness import calculate_readiness
from .rubric import level_for_score
from .scoring import ScoreBreakdown, calculate_interview_score
from .verdict import assign_verdict

# V3 integrity + evidence
try:
    from .integrity import apply_anti_flattery_cap, validate_evidence
    from .star_evaluator import STAREvaluator
    _V3_AVAILABLE = True
except ImportError:
    _V3_AVAILABLE = False

__all__ = [
    "CoachingCard",
    "PrepItem",
    "STAREvaluator",
    "ScoreBreakdown",
    "apply_anti_flattery_cap",
    "assign_verdict",
    "calculate_interview_score",
    "calculate_readiness",
    "generate_narrative",
    "generate_prep_list",
    "level_for_score",
    "validate_evidence",
]
