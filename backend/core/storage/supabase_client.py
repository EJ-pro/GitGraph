import os
import logging
from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Client | None = None
STORAGE_BUCKET = os.getenv("SUPABASE_BUCKET", "chatfolio-assets")


def get_supabase() -> Client | None:
    """
    Singleton Supabase client using the service_role key (backend-only).
    Returns None if env vars are missing — callers must handle gracefully.
    """
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")  # service_role key, not anon
    if not url or not key:
        logger.warning("[Supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — storage disabled")
        return None

    try:
        _client = create_client(url, key)
        logger.info("[Supabase] Client initialised for %s", url)
    except Exception as e:
        logger.warning("[Supabase] Failed to initialise client: %s", e)
    return _client


def upload_readme(project_id: int, readme_id: int, content: str) -> str | None:
    """
    README 마크다운을 Supabase Storage에 업로드.
    Returns: public URL or None on failure.
    """
    client = get_supabase()
    if not client:
        return None
    try:
        path = f"readmes/{project_id}/{readme_id}.md"
        client.storage.from_(STORAGE_BUCKET).upload(
            path,
            content.encode("utf-8"),
            {"content-type": "text/markdown", "upsert": "true"},
        )
        return client.storage.from_(STORAGE_BUCKET).get_public_url(path)
    except Exception as e:
        logger.warning("[Supabase] upload_readme failed (project=%d): %s", project_id, e)
        return None


def upload_diagram(project_id: int, mermaid_code: str) -> str | None:
    """
    Mermaid 다이어그램 소스를 Supabase Storage에 업로드.
    Returns: public URL or None on failure.
    """
    client = get_supabase()
    if not client:
        return None
    try:
        path = f"diagrams/{project_id}/diagram.mmd"
        client.storage.from_(STORAGE_BUCKET).upload(
            path,
            mermaid_code.encode("utf-8"),
            {"content-type": "text/plain", "upsert": "true"},
        )
        return client.storage.from_(STORAGE_BUCKET).get_public_url(path)
    except Exception as e:
        logger.warning("[Supabase] upload_diagram failed (project=%d): %s", project_id, e)
        return None


def delete_project_assets(project_id: int) -> None:
    """프로젝트 삭제 시 Storage 자산도 정리."""
    client = get_supabase()
    if not client:
        return
    try:
        bucket = client.storage.from_(STORAGE_BUCKET)
        for prefix in [f"readmes/{project_id}", f"diagrams/{project_id}"]:
            files = bucket.list(prefix)
            if files:
                paths = [f["name"] for f in files if "name" in f]
                if paths:
                    bucket.remove([f"{prefix}/{p}" for p in paths])
    except Exception as e:
        logger.warning("[Supabase] delete_project_assets failed (project=%d): %s", project_id, e)
