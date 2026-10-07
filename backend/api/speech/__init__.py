"""
Speech API module for handling STT/TTS functionality and WebSocket processing.
"""

from .connection_manager import ConnectionManager
from .deepgram_handlers import DeepgramEventHandlers
from .stt_service import STTService
from .tts_service import TTSService
from .websocket_processor import WebSocketMessageProcessor

__all__ = [
    'ConnectionManager',
    'DeepgramEventHandlers',
    'STTService',
    'TTSService',
    'WebSocketMessageProcessor',
]
