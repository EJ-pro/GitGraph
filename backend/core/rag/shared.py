import logging
from langchain_huggingface import HuggingFaceEmbeddings
from sentence_transformers import CrossEncoder

logger = logging.getLogger(__name__)

_embeddings: HuggingFaceEmbeddings | None = None
_reranker: CrossEncoder | None = None


def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("[Shared] Loading BGE-M3 (one-time init)…")
        _embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-m3")
        logger.info("[Shared] BGE-M3 ready.")
    return _embeddings


def get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        logger.info("[Shared] Loading CrossEncoder re-ranker (one-time init)…")
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        logger.info("[Shared] CrossEncoder ready.")
    return _reranker


def warmup() -> None:
    """서버 시작 시 모델을 미리 로드한다 (첫 요청 지연 제거)."""
    get_embeddings()
    get_reranker()
