"""
backend/services/__init__.py
─────────────────────────────────────────────────────────────────────────────
Services package for the AUREA Flask backend.

Services are the business logic layer — they are called by route handlers
and should never import from routes directly.

Services registered here (implemented phase by phase):
  - ai_service.py      → Gemini AI client for LOLO AUREA (Phase 5)
  - memory_service.py  → Long-term memory extraction + CRUD (Phase 6)
  - tts_service.py     → Text-to-Speech proxy (Phase 7)
  - stt_service.py     → Speech-to-Text proxy (Phase 8)
─────────────────────────────────────────────────────────────────────────────
"""
