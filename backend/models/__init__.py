# Core 12-table schema
from backend.models.core import (
    CandidateAnswer,
    CandidateProfile,
    InterviewBlueprint,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
    PlatformUser,
    RecommendedResource,
    Score,
    ScoreDimension,
    SpeechTask,
    TurnFeedback,
)
from backend.models.draft import Draft

# V4 institutional models
from backend.models.institutional import (
    Cohort,
    CohortMember,
    DriveAllocation,
    Organization,
    PlacementDrive,
)
from backend.models.session import LegacySession, SessionStage
from backend.models.user import User, UserRole
