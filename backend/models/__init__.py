# Core 12-table schema
from backend.models.core import (
    CandidateAnswer,
    CandidateProfile,
    InterviewBlueprint,
    InterviewQuestion,
    InterviewReport,
    PlatformUser,
    RecommendedResource,
    Score,
    ScoreDimension,
    SpeechTask,
    TurnFeedback,
)
from backend.models.core import (
    InterviewSession as CoreInterviewSession,
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
from backend.models.session import CodingInterviewSession, SessionStage
from backend.models.user import User, UserRole
