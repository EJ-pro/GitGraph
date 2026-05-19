from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from models.schemas import AnalyzeRequest, ChatRequest, AnalysisResponse, DiagramRequest, DiagramResponse, ReadmeRequest, ReadmeResponse, NewSessionRequest, ProfileUpdateRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import os
import re
import time
import logging
from dotenv import load_dotenv
import json
import asyncio
from queue import Queue
from threading import Thread

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

from core.parser.github_fetcher import GitHubFetcher
from core.parser.factory import get_parser_result
from core.graph.graph_builder import DependencyGraphBuilder, compress_graph, load_graph
from core.rag.engine import ChatFolioEngine
from core.rag.shared import warmup
from core.cache.redis_client import cache_get, cache_set, cache_delete_pattern
from core.cache.rate_limiter import check_rate_limit
from database.models import init_db, Project, ProjectFile, ChatSession, ChatMessage, User, Inquiry, ProjectInsight, TokenUsage, GeneratedReadme
from database.database import get_db, SessionLocal
from api.auth import router as auth_router, get_current_user

load_dotenv()
init_db()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("[Startup] Pre-loading embedding + reranker models...")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, warmup)
    logger.info("[Startup] Models ready.")
    yield


def record_token_usage(db: Session, user_id: int, model_name: str, feature_name: str, token_count: int):
    if not token_count or token_count <= 0:
        return
    try:
        db.add(TokenUsage(user_id=user_id, model_name=model_name,
                          feature_name=feature_name, token_count=int(token_count)))
        db.commit()
    except Exception as e:
        logger.warning("Failed to record token usage: %s", e)
        db.rollback()


def contains_pii(text: str) -> bool:
    if not text:
        return False
    phone_pattern = re.compile(r"(?:01[016789]|02|0[3-6]\d)[-.\s]?\d{3,4}[-.\s]?\d{4}")
    rrn_pattern = re.compile(r"\d{6}[-.\s]?[1-4]\d{6}")
    email_pattern = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
    return bool(phone_pattern.search(text) or rrn_pattern.search(text) or email_pattern.search(text))


def _build_files_metadata(project_files) -> dict:
    """ProjectFile ORM objects → {path: {importance_score, chunks}} for graph-boosted reranking."""
    result = {}
    for f in project_files:
        meta = f.metadata_json or {}
        chunks = meta.get("parsed", {}).get("chunks") if meta else None
        result[f.file_path] = {
            "importance_score": float(f.importance_score) if f.importance_score else 0.0,
            "chunks": chunks,
        }
    return result


app = FastAPI(title="ChatFolio API", lifespan=lifespan)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost,http://localhost:5173")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

# ──────────────────────────────────────────
# INQUIRIES
# ──────────────────────────────────────────

@app.post("/inquiries")
async def create_inquiry(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    data = await request.json()
    title = data.get("title")
    content = data.get("content")
    if not title or not content:
        raise HTTPException(status_code=400, detail="제목과 내용을 입력해주세요.")
    inquiry = Inquiry(user_id=current_user.id, title=title, content=content)
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)
    return {"status": "success", "message": "Your inquiry has been received."}

# ──────────────────────────────────────────
# USER PROFILE
# ──────────────────────────────────────────

@app.patch("/user/profile")
async def update_user_profile(request: ProfileUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if request.country is not None:
        current_user.country = request.country
    if request.job is not None:
        current_user.job = request.job
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "user": {"country": current_user.country, "job": current_user.job}}

# ──────────────────────────────────────────
# STATS
# ──────────────────────────────────────────

@app.get("/stats/global")
async def get_global_stats(db: Session = Depends(get_db)):
    cached = cache_get("stats:global")
    if cached:
        return cached

    total_projects = db.query(Project).count()
    total_users = db.query(User).count()
    total_lines = db.query(func.sum(ProjectFile.line_count)).scalar() or 0
    total_nodes = db.query(func.sum(Project.node_count)).scalar() or 0
    total_answers = db.query(ChatMessage).filter(ChatMessage.role == "assistant").count()
    result = {
        "total_projects": total_projects,
        "total_users": total_users,
        "total_lines": total_lines,
        "total_nodes": total_nodes,
        "total_answers": total_answers,
        "avg_analysis_time": "42s",
        "ai_health": 99.9,
    }
    cache_set("stats:global", result, ttl=60)
    return result

# ──────────────────────────────────────────
# ENGINE CACHE
# ──────────────────────────────────────────

_ENGINE_CACHE_TTL = int(os.getenv("ENGINE_CACHE_TTL_SECONDS", "3600"))


class _TTLCache:
    """session_id → engine 매핑. TTL 초과 항목은 접근 시 자동 제거."""
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._store: dict = {}

    def __contains__(self, key):
        if key in self._store:
            _, ts = self._store[key]
            if time.monotonic() - ts < self._ttl:
                return True
            del self._store[key]
        return False

    def __setitem__(self, key, value):
        self._store[key] = (value, time.monotonic())
        self._evict()

    def get(self, key, default=None):
        return self._store[key][0] if key in self else default

    def _evict(self):
        now = time.monotonic()
        expired = [k for k, (_, ts) in self._store.items() if now - ts >= self._ttl]
        for k in expired:
            del self._store[k]
        if expired:
            logger.info("engine_cache: evicted %d expired session(s)", len(expired))


engine_cache = _TTLCache(_ENGINE_CACHE_TTL)

# ──────────────────────────────────────────
# ANALYZE
# ──────────────────────────────────────────

@app.post("/analyze")
async def analyze_repository(request: AnalyzeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    allowed, retry_after = check_rate_limit(current_user.id, "analyze", tier=current_user.tier)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"분석 요청이 너무 많습니다. {retry_after}초 후 다시 시도해주세요.",
            headers={"Retry-After": str(retry_after)},
        )

    if request.provider == "groq" and request.model_name == "llama-3.3-70b-versatile" and current_user.tier != "pro":
        raise HTTPException(status_code=402, detail="Standard AI (Fast) 모델은 Pro 등급 전용입니다.")

    existing_project = db.query(Project).filter(
        Project.repo_url == request.repo_url,
        Project.user_id == current_user.id,
    ).first()

    if existing_project and not request.force_update:
        token = current_user.github_token or os.getenv("GITHUB_TOKEN")
        fetcher = GitHubFetcher(token=token)
        try:
            latest_commit = fetcher.fetch_latest_commit(request.repo_url)
            if latest_commit["hash"] == existing_project.last_commit_hash:
                existing_session = db.query(ChatSession).filter(
                    ChatSession.project_id == existing_project.id,
                    ChatSession.user_id == current_user.id,
                    ChatSession.provider == request.provider,
                    ChatSession.model_name == request.model_name,
                ).order_by(ChatSession.created_at.desc()).first()
                if existing_session:
                    if existing_session.id not in engine_cache:
                        all_project_files = {f.file_path: f.content for f in existing_project.files}
                        files_metadata = _build_files_metadata(existing_project.files)
                        graph = load_graph(existing_project.graph_data)
                        engine = ChatFolioEngine(
                            all_project_files, graph,
                            project_id=existing_project.id,
                            provider=existing_session.provider,
                            model_name=existing_session.model_name,
                            files_metadata=files_metadata,
                        )
                        engine_cache[existing_session.id] = engine

                    async def quick_return():
                        result = {
                            "status": "success",
                            "session_id": existing_session.id,
                            "file_count": existing_project.file_count,
                            "node_count": existing_project.node_count,
                            "edge_count": existing_project.edge_count,
                            "message": "Loaded existing analysis result.",
                        }
                        yield f"data: RESULT:{json.dumps(result)}\n\n"
                    return StreamingResponse(quick_return(), media_type="text/event-stream")
        except Exception as _e:
            logger.warning("Failed to check latest commit, proceeding with full analysis: %s", _e)

    def generate():
        q: Queue = Queue()

        def progress_callback(msg):
            q.put(msg)

        def run_analysis():
            db_session = SessionLocal()
            try:
                token = current_user.github_token or os.getenv("GITHUB_TOKEN")
                fetcher = GitHubFetcher(token=token)
                commit_info, file_generator = fetcher.fetch_repo_files(
                    request.repo_url, progress_callback=progress_callback
                )

                project = db_session.query(Project).filter(
                    Project.repo_url == request.repo_url,
                    Project.user_id == current_user.id,
                ).first()
                if project:
                    project.file_count = commit_info["total_files"]
                    project.last_commit_hash = commit_info["hash"]
                    project.last_commit_message = commit_info["message"]
                    db_session.query(ProjectFile).filter(ProjectFile.project_id == project.id).delete()
                else:
                    project = Project(
                        user_id=current_user.id,
                        repo_url=request.repo_url,
                        file_count=commit_info["total_files"],
                        last_commit_hash=commit_info["hash"],
                        last_commit_message=commit_info["message"],
                    )
                    db_session.add(project)
                db_session.flush()

                all_files: dict = {}
                all_meta: dict = {}
                lang_counts: dict = {}
                detected_frameworks: set = set()

                # Parallel file parsing
                raw_files = list(file_generator)

                def _parse_one(item):
                    path, content = item
                    return path, content, get_parser_result(path, content)

                with ThreadPoolExecutor(max_workers=4) as executor:
                    parsed_results = list(executor.map(_parse_one, raw_files))

                for path, content, meta in parsed_results:
                    all_files[path] = content
                    parsed_data = meta.get("metadata_json", {}).get("parsed", {})
                    if "language" in parsed_data:
                        lang = parsed_data["language"]
                        lang_counts[lang] = lang_counts.get(lang, 0) + 1
                    for key, val in parsed_data.items():
                        if key.startswith("is_") and val is True:
                            detected_frameworks.add(key.replace("is_", "").replace("_", " ").title())
                    if path.endswith((".kt", ".kts", ".java", ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs")):
                        all_meta[path] = meta
                    db_session.add(ProjectFile(
                        project_id=project.id,
                        file_path=path,
                        content=content,
                        line_count=meta.get("line_count", 0),
                        file_size=len(content.encode("utf-8")),
                        keywords=meta.get("keywords", []),
                        metadata_json=meta.get("metadata_json", {}),
                    ))

                tech_stack_json = {
                    "main_language": max(lang_counts, key=lang_counts.get) if lang_counts else "Unknown",
                    "language_distribution": lang_counts,
                    "frameworks": list(detected_frameworks),
                }
                db_session.query(ProjectInsight).filter(ProjectInsight.project_id == project.id).delete()
                db_session.add(ProjectInsight(
                    project_id=project.id,
                    tech_stack=tech_stack_json,
                    summary=f"Analyzed {project.repo_url}",
                ))

                # Build graph + PageRank
                builder = DependencyGraphBuilder()
                graph = builder.build_graph(all_meta)
                pagerank = builder.get_pagerank()

                # Update importance_score per file using PageRank
                if pagerank:
                    for pf in db_session.query(ProjectFile).filter(ProjectFile.project_id == project.id).all():
                        score = pagerank.get(pf.file_path, 0.0)
                        pf.importance_score = round(score * 1_000_000)  # store as int (micro-units)

                # Save graph in v2 compressed format
                project.node_count = graph.number_of_nodes()
                project.edge_count = graph.number_of_edges()
                project.graph_data = compress_graph(graph)

                # Session management
                chat_session = db_session.query(ChatSession).filter(
                    ChatSession.project_id == project.id,
                    ChatSession.user_id == current_user.id,
                    ChatSession.is_deleted == 0,
                ).order_by(ChatSession.created_at.desc()).first()

                if not chat_session:
                    chat_session = ChatSession(
                        user_id=current_user.id,
                        project_id=project.id,
                        provider=request.provider,
                        model_name=request.model_name,
                    )
                    db_session.add(chat_session)
                else:
                    chat_session.provider = request.provider
                    chat_session.model_name = request.model_name

                project.status = "COMPLETED"
                db_session.commit()
                db_session.refresh(chat_session)

                # Build files_metadata with PageRank scores
                files_metadata = {
                    path: {"importance_score": pagerank.get(path, 0.0), "chunks": None}
                    for path in all_files
                }

                engine = ChatFolioEngine(
                    all_files, graph,
                    project_id=project.id,
                    tech_stack=tech_stack_json,
                    provider=request.provider,
                    model_name=request.model_name,
                    force_reload=True,
                    files_metadata=files_metadata,
                )
                engine_cache[chat_session.id] = engine

                # Invalidate stale caches
                cache_delete_pattern("stats:global")
                cache_delete_pattern(f"projects:user:{current_user.id}")

                q.put(f"RESULT:{json.dumps({'status': 'success', 'session_id': chat_session.id, 'file_count': project.file_count, 'message': 'Analysis complete'})}")
                q.put(None)
            except Exception as e:
                db_session.rollback()
                q.put(f"ERROR:{str(e)}")
                q.put(None)
            finally:
                db_session.close()

        Thread(target=run_analysis).start()
        while True:
            msg = q.get()
            if msg is None:
                break
            yield f"data: {msg}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

# ──────────────────────────────────────────
# CHAT
# ──────────────────────────────────────────

@app.post("/chat")
async def chat_ask(request: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    allowed, retry_after = check_rate_limit(current_user.id, "chat", tier=current_user.tier)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"요청이 너무 많습니다. {retry_after}초 후 다시 시도해주세요.",
            headers={"Retry-After": str(retry_after)},
        )

    session_id = request.session_id
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
    project = chat_session.project

    try:
        engine = engine_cache.get(session_id)
        if not engine:
            logger.info("[Chat] Initializing engine for session %s...", session_id)
            graph = load_graph(project.graph_data)
            all_project_files = {f.file_path: f.content for f in project.files}
            files_metadata = _build_files_metadata(project.files)
            engine = ChatFolioEngine(
                all_project_files, graph,
                project_id=project.id,
                provider=chat_session.provider,
                model_name=chat_session.model_name,
                files_metadata=files_metadata,
            )
            engine_cache[session_id] = engine
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Engine initialization failed: {str(e)}")

    try:
        # Load last 20 messages (history compression handles overflow inside engine)
        history_msgs = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.created_at.desc()).limit(20).all()
        history = [{"role": m.role, "content": m.content} for m in reversed(history_msgs)]

        if contains_pii(request.query):
            async def pii_blocked_stream():
                yield f"data: {json.dumps({'token': '개인정보(전화번호, 주민번호, 이메일 등)가 포함된 요청은 처리할 수 없습니다.'})}\n\n"
                yield f"data: {json.dumps({'status': 'done'})}\n\n"
            return StreamingResponse(pii_blocked_stream(), media_type="text/event-stream")

        db.add(ChatMessage(session_id=session_id, role="user", content=request.query))
        db.commit()

        async def chat_stream():
            try:
                stream_gen = engine.ask_stream(request.query, history=history, language=request.language)
                sources = []
                graph_trace = []
                context_text = ""
                full_answer = ""

                for item in stream_gen:
                    if item["type"] == "meta":
                        sources = item["sources"][:8]
                        graph_trace = item["graph_trace"]
                        context_text = item.get("context_text", "")
                        yield f"data: {json.dumps({'sources': sources, 'graph_trace': graph_trace})}\n\n"
                    elif item["type"] == "token":
                        full_answer += item["token"]
                        if contains_pii(full_answer):
                            yield f"data: {json.dumps({'token': chr(10) + chr(10) + '[개인정보 보호를 위해 답변이 중단되었습니다.]'})}\n\n"
                            yield f"data: {json.dumps({'status': 'done'})}\n\n"
                            break
                        yield f"data: {json.dumps({'token': item['token']})}\n\n"
                    elif item["type"] == "done":
                        # Save assistant message
                        db_session = SessionLocal()
                        try:
                            db_session.add(ChatMessage(
                                session_id=session_id,
                                role="assistant",
                                content=full_answer,
                                sources=sources,
                            ))
                            current_sess = db_session.query(ChatSession).filter(ChatSession.id == session_id).first()
                            if current_sess and current_sess.title == "New Chat":
                                try:
                                    title_info = engine.summarize_title(request.query)
                                    current_sess.title = title_info["title"]
                                except Exception:
                                    current_sess.title = request.query[:20] + "..."
                            db_session.commit()
                        except Exception as e:
                            db_session.rollback()
                            logger.warning("Error saving chat assistant message: %s", e)
                        finally:
                            db_session.close()

                        yield f"data: {json.dumps({'status': 'done'})}\n\n"

                        # Async self-evaluation — runs in thread so it doesn't block the event loop
                        loop = asyncio.get_event_loop()
                        evaluation = await loop.run_in_executor(
                            None, engine._evaluate_answer, request.query, full_answer, context_text
                        )

                        db_session = SessionLocal()
                        try:
                            msg = db_session.query(ChatMessage).filter(
                                ChatMessage.session_id == session_id,
                                ChatMessage.role == "assistant",
                            ).order_by(ChatMessage.created_at.desc()).first()
                            if msg:
                                msg.evaluation = evaluation
                                db_session.commit()
                        except Exception as e:
                            db_session.rollback()
                            logger.warning("Error updating evaluation: %s", e)
                        finally:
                            db_session.close()

                        yield f"data: {json.dumps({'evaluation': evaluation})}\n\n"

            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(chat_stream(), media_type="text/event-stream")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────
# CHAT HISTORY / SESSIONS
# ──────────────────────────────────────────

@app.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content,
             "sources": m.sources, "evaluation": m.evaluation, "created_at": m.created_at}
            for m in messages]

@app.get("/projects")
async def get_user_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cache_key = f"projects:user:{current_user.id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    projects = db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()
    result = [{
        "id": p.id,
        "repo_url": p.repo_url,
        "file_count": p.file_count,
        "last_commit_message": p.last_commit_message,
        "latest_session_id": (
            db.query(ChatSession).filter(ChatSession.project_id == p.id)
            .order_by(ChatSession.created_at.desc()).first().id
            if db.query(ChatSession).filter(ChatSession.project_id == p.id).count() > 0
            else None
        ),
    } for p in projects]
    cache_set(cache_key, result, ttl=30)
    return result

# ──────────────────────────────────────────
# GENERATE — NETWORK / ARCHITECTURE / PIPELINE / README
# ──────────────────────────────────────────

@app.post("/generate/network")
async def generate_network_data(request: DiagramRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    graph = load_graph(chat_session.project.graph_data)
    nodes, links = [], []
    degree_dict = dict(graph.degree())
    for node in graph.nodes():
        nodes.append({
            "id": node,
            "name": node.split("/")[-1],
            "group": node.split("/")[-2] if "/" in node else "root",
            "val": max(1, min(20, degree_dict.get(node, 1))),
        })
    for u, v in graph.edges():
        links.append({"source": u, "target": v})
    return {"nodes": nodes, "links": links}


def _get_or_build_engine(session_id: str, project, chat_session) -> ChatFolioEngine:
    engine = engine_cache.get(session_id)
    if not engine:
        graph = load_graph(project.graph_data)
        files_metadata = _build_files_metadata(project.files)
        engine = ChatFolioEngine(
            {f.file_path: f.content for f in project.files},
            graph,
            project_id=project.id,
            provider=chat_session.provider,
            model_name=chat_session.model_name,
            files_metadata=files_metadata,
        )
        engine_cache[session_id] = engine
    return engine


@app.post("/generate/architecture-analysis")
async def generate_architecture_analysis(request: DiagramRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
    project = chat_session.project

    if project.architecture_analysis and not request.force_regenerate:
        return {"analysis": project.architecture_analysis}
    if not request.generate_if_missing:
        return {"analysis": None, "status": "no_cache"}

    engine = _get_or_build_engine(request.session_id, project, chat_session)
    result = engine.analyze_architecture(language="Korean" if current_user.country == "South Korea" else "English")
    project.architecture_analysis = result.get("analysis")
    db.commit()
    return {"analysis": project.architecture_analysis}


@app.post("/generate/pipeline")
async def generate_project_pipeline(request: DiagramRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
    project = chat_session.project

    if project.pipeline_data and not request.force_regenerate:
        return project.pipeline_data
    if not request.generate_if_missing:
        return {"steps": [], "status": "no_cache"}

    engine = _get_or_build_engine(request.session_id, project, chat_session)
    try:
        pipeline_data = engine.generate_pipeline(
            language="Korean" if current_user.country == "South Korea" else "English"
        )
        project.pipeline_data = pipeline_data
        db.commit()
        return pipeline_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/readmes/{project_id}")
async def get_project_readmes(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    readmes = db.query(GeneratedReadme).filter(
        GeneratedReadme.project_id == project_id
    ).order_by(GeneratedReadme.created_at.desc()).all()
    return [{"id": r.id, "content": r.content, "template_type": r.template_type, "created_at": r.created_at}
            for r in readmes]


@app.post("/generate/readme")
async def generate_readme(request: ReadmeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
    project = chat_session.project

    if not request.force_regenerate:
        existing_readme = db.query(GeneratedReadme).filter(
            GeneratedReadme.project_id == project.id
        ).order_by(GeneratedReadme.created_at.desc()).first()
        if existing_readme:
            return {"readme_content": existing_readme.content, "status": "cached"}

    if not request.generate_if_missing:
        return {"readme_content": None, "status": "no_cache"}

    engine = _get_or_build_engine(request.session_id, project, chat_session)
    result = engine.generate_readme(languages=request.languages)
    readme_content = result["readme_content"]

    new_readme = GeneratedReadme(project_id=project.id, content=readme_content)
    db.add(new_readme)
    db.commit()
    return {"readme_content": readme_content, "status": "generated"}

# ──────────────────────────────────────────
# SESSION MANAGEMENT
# ──────────────────────────────────────────

@app.get("/chat/session/{session_id}/info")
async def get_session_info(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "project_id": session.project_id,
        "title": session.title,
        "provider": session.provider,
        "model_name": session.model_name,
        "created_at": session.created_at,
    }


@app.get("/chat/sessions/{project_id}")
async def get_project_sessions(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = db.query(ChatSession).filter(
        ChatSession.project_id == project_id,
        ChatSession.user_id == current_user.id,
        ChatSession.is_deleted == 0,
    ).order_by(ChatSession.created_at.desc()).all()
    return [{"session_id": s.id, "title": s.title, "created_at": s.created_at} for s in sessions]


@app.post("/chat/session/new")
async def create_new_session(request: NewSessionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_session = ChatSession(
        user_id=current_user.id,
        project_id=request.project_id,
        provider=request.provider,
        model_name=request.model_name,
        title="New Chat",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return {"status": "success", "session_id": new_session.id}


@app.delete("/chat/session/{session_id}")
async def delete_chat_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_deleted = 1
    db.commit()
    cache_delete_pattern(f"projects:user:{current_user.id}")
    return {"status": "success", "message": "Session deleted"}
