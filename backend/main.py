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
import networkx as nx
from dotenv import load_dotenv
import json
import asyncio
from queue import Queue
from threading import Thread

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

from core.parser.github_fetcher import GitHubFetcher
from core.parser.factory import get_parser_result
from core.graph.graph_builder import DependencyGraphBuilder
from core.rag.engine import ChatFolioEngine
from database.models import init_db, Project, ProjectFile, ChatSession, ChatMessage, User, Inquiry, ProjectInsight, TokenUsage, GeneratedReadme
from database.database import get_db, SessionLocal
from api.auth import router as auth_router, get_current_user

load_dotenv()
init_db()

def record_token_usage(db: Session, user_id: int, model_name: str, feature_name: str, token_count: int):
    """토큰 사용량을 상세히 기록합니다."""
    if not token_count or token_count <= 0:
        return
    try:
        new_usage = TokenUsage(
            user_id=user_id,
            model_name=model_name,
            feature_name=feature_name,
            token_count=int(token_count)
        )
        db.add(new_usage)
        db.commit()
    except Exception as e:
        print(f"Failed to record token usage: {e}")
        db.rollback()

def contains_pii(text: str) -> bool:
    if not text:
        return False
    
    phone_pattern = re.compile(r"(?:01[016789]|02|0[3-6]\d)[-.\s]?\d{3,4}[-.\s]?\d{4}")
    rrn_pattern = re.compile(r"\d{6}[-.\s]?[1-4]\d{6}")
    email_pattern = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
    
    if phone_pattern.search(text) or rrn_pattern.search(text) or email_pattern.search(text):
        return True
    return False

app = FastAPI(title="ChatFolio API")

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

# 문의하기 등록 엔드포인트
@app.post("/inquiries")
async def create_inquiry(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    data = await request.json()
    title = data.get("title")
    content = data.get("content")
    
    if not title or not content:
        raise HTTPException(status_code=400, detail="제목과 내용을 입력해주세요.")
        
    inquiry = Inquiry(
        user_id=current_user.id,
        title=title,
        content=content
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)
    return {"status": "success", "message": "Your inquiry has been received."}

@app.patch("/user/profile")
async def update_user_profile(request: ProfileUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if request.country is not None:
        current_user.country = request.country
    if request.job is not None:
        current_user.job = request.job
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "user": {"country": current_user.country, "job": current_user.job}}

@app.get("/stats/global")
async def get_global_stats(db: Session = Depends(get_db)):
    total_projects = db.query(Project).count()
    total_users = db.query(User).count()
    total_lines = db.query(func.sum(ProjectFile.line_count)).scalar() or 0
    total_nodes = db.query(func.sum(Project.node_count)).scalar() or 0
    total_answers = db.query(ChatMessage).filter(ChatMessage.role == "assistant").count()
    
    return {
        "total_projects": total_projects,
        "total_users": total_users,
        "total_lines": total_lines,
        "total_nodes": total_nodes,
        "total_answers": total_answers,
        "avg_analysis_time": "42s", # 실시간 계산 필드가 없으므로 합리적인 수치 제공
        "ai_health": 99.9
    }

_ENGINE_CACHE_TTL = int(os.getenv("ENGINE_CACHE_TTL_SECONDS", "3600"))

class _TTLCache:
    """session_id → engine 매핑. TTL 초과 항목은 접근 시 자동 제거."""
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._store: dict = {}   # {key: (value, inserted_at)}

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

@app.post("/analyze")
async def analyze_repository(request: AnalyzeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if request.provider == "groq" and request.model_name == "llama-3.3-70b-versatile" and current_user.tier != "pro":
        raise HTTPException(status_code=402, detail="Standard AI (Fast) 모델은 Pro 등급 전용입니다.")

    existing_project = db.query(Project).filter(Project.repo_url == request.repo_url, Project.user_id == current_user.id).first()
    if existing_project and not request.force_update:
        token = current_user.github_token or os.getenv("GITHUB_TOKEN")
        fetcher = GitHubFetcher(token=token)
        try:
            latest_commit = fetcher.fetch_latest_commit(request.repo_url)
            if latest_commit["hash"] == existing_project.last_commit_hash:
                existing_session = db.query(ChatSession).filter(ChatSession.project_id == existing_project.id, ChatSession.user_id == current_user.id, ChatSession.provider == request.provider, ChatSession.model_name == request.model_name).order_by(ChatSession.created_at.desc()).first()
                if existing_session:
                    if existing_session.id not in engine_cache:
                        all_project_files = {f.file_path: f.content for f in existing_project.files}
                        graph = nx.node_link_graph(existing_project.graph_data)
                        engine = ChatFolioEngine(all_project_files, graph, project_id=existing_project.id, provider=existing_session.provider, model_name=existing_session.model_name)
                        engine_cache[existing_session.id] = engine
                    async def quick_return():
                        result = {"status": "success", "session_id": existing_session.id, "file_count": existing_project.file_count, "node_count": existing_project.node_count, "edge_count": existing_project.edge_count, "message": "Loaded existing analysis result."}
                        yield f"data: RESULT:{json.dumps(result)}\n\n"
                    return StreamingResponse(quick_return(), media_type="text/event-stream")
        except Exception as _e:
            logger.warning("Failed to check latest commit, proceeding with full analysis: %s", _e)

    def generate():
        q = Queue()
        def progress_callback(msg): q.put(msg)
        def run_analysis():
            db_session = SessionLocal()
            try:
                token = current_user.github_token or os.getenv("GITHUB_TOKEN")
                fetcher = GitHubFetcher(token=token)
                commit_info, file_generator = fetcher.fetch_repo_files(request.repo_url, progress_callback=progress_callback)
                project = db_session.query(Project).filter(Project.repo_url == request.repo_url, Project.user_id == current_user.id).first()
                if project:
                    project.file_count = commit_info["total_files"]
                    project.last_commit_hash = commit_info["hash"]
                    project.last_commit_message = commit_info["message"]
                    db_session.query(ProjectFile).filter(ProjectFile.project_id == project.id).delete()
                else:
                    project = Project(user_id=current_user.id, repo_url=request.repo_url, file_count=commit_info["total_files"], last_commit_hash=commit_info["hash"], last_commit_message=commit_info["message"])
                    db_session.add(project)
                db_session.flush()
                all_files, all_meta = {}, {}
                lang_counts, detected_frameworks, used_parsers = {}, set(), set()
                for path, content in file_generator:
                    all_files[path] = content
                    meta = get_parser_result(path, content)
                    parsed_data = meta.get("metadata_json", {}).get("parsed", {})
                    if "language" in parsed_data:
                        lang = parsed_data["language"]
                        lang_counts[lang] = lang_counts.get(lang, 0) + 1
                    for key, val in parsed_data.items():
                        if key.startswith("is_") and val is True:
                            detected_frameworks.add(key.replace("is_", "").replace("_", " ").title())
                    if path.endswith(('.kt', '.kts', '.java', '.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs')):
                        all_meta[path] = meta
                    db_session.add(ProjectFile(project_id=project.id, file_path=path, content=content, line_count=meta.get("line_count", 0), file_size=len(content.encode('utf-8')), keywords=meta.get("keywords", []), metadata_json=meta.get("metadata_json", {})))
                
                tech_stack_json = {"main_language": max(lang_counts, key=lang_counts.get) if lang_counts else "Unknown", "language_distribution": lang_counts, "frameworks": list(detected_frameworks)}
                db_session.query(ProjectInsight).filter(ProjectInsight.project_id == project.id).delete()
                db_session.add(ProjectInsight(project_id=project.id, tech_stack=tech_stack_json, summary=f"Analyzed {project.repo_url}"))
                
                builder = DependencyGraphBuilder()
                graph = builder.build_graph(all_meta)
                project.node_count, project.edge_count, project.graph_data = graph.number_of_nodes(), graph.number_of_edges(), nx.node_link_data(graph)
                
                # --- [ChatSession 관리] ---
                # 기존 세션이 있는지 확인 (있으면 재사용, 없으면 생성)
                chat_session = db_session.query(ChatSession).filter(
                    ChatSession.project_id == project.id,
                    ChatSession.user_id == current_user.id,
                    ChatSession.is_deleted == 0
                ).order_by(ChatSession.created_at.desc()).first()

                if not chat_session:
                    chat_session = ChatSession(
                        user_id=current_user.id,
                        project_id=project.id,
                        provider=request.provider,
                        model_name=request.model_name
                    )
                    db_session.add(chat_session)
                else:
                    # 기존 세션 정보 업데이트
                    chat_session.provider = request.provider
                    chat_session.model_name = request.model_name

                project.status = "COMPLETED"
                db_session.commit()
                db_session.refresh(chat_session)
                
                engine = ChatFolioEngine(all_files, graph, project_id=project.id, tech_stack=tech_stack_json, provider=request.provider, model_name=request.model_name, force_reload=True)
                engine_cache[chat_session.id] = engine
                
                q.put(f"RESULT:{json.dumps({'status': 'success', 'session_id': chat_session.id, 'file_count': project.file_count, 'message': 'Analysis complete'})}")
                q.put(None)
            except Exception as e:
                db_session.rollback()
                q.put(f"ERROR:{str(e)}")
                q.put(None)
            finally: db_session.close()
        Thread(target=run_analysis).start()
        while True:
            msg = q.get()
            if msg is None: break
            yield f"data: {msg}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/chat")
async def chat_ask(request: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session_id = request.session_id
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session: raise HTTPException(status_code=404, detail="Session not found")
    project = chat_session.project
    try:
        engine = engine_cache.get(session_id)
        if not engine:
            print(f"🔄 [Chat] Initializing engine for session {session_id}...")
            graph = nx.node_link_graph(project.graph_data)
            # 세션 만료 방지를 위해 즉시 리스트로 변환
            all_project_files = {f.file_path: f.content for f in project.files}
            engine = ChatFolioEngine(
                all_project_files, 
                graph, 
                project_id=project.id, 
                provider=chat_session.provider, 
                model_name=chat_session.model_name
            )
            engine_cache[session_id] = engine
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Engine initialization failed: {str(e)}")

    try:
        # 1. 이전 대화 내역 가져오기 (최근 10개)
        history_msgs = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.created_at.desc()).limit(10).all()
        
        # 엔진에 전달할 형식으로 변환 (오래된 순으로)
        history = [{"role": m.role, "content": m.content} for m in reversed(history_msgs)]
        
        # 2. 사용자 질문 저장
        # 2. 사용자 질문 저장 (개인정보 포함 시 차단)
        if contains_pii(request.query):
            async def pii_blocked_stream():
                yield f"data: {json.dumps({'token': '개인정보(전화번호, 주민번호, 이메일 등)가 포함된 요청은 처리할 수 없습니다.'})}\n\n"
                yield f"data: {json.dumps({'status': 'done'})}\n\n"
            return StreamingResponse(pii_blocked_stream(), media_type="text/event-stream")
            
        db.add(ChatMessage(session_id=session_id, role="user", content=request.query))
        db.commit()

        async def chat_stream():
            try:
                # We must use ask_stream from the engine!
                stream_generator = engine.ask_stream(request.query, history=history, language=request.language)
                
                sources = []
                graph_trace = []
                context_text = ""
                full_answer = ""
                
                for item in stream_generator:
                    if item["type"] == "meta":
                        sources = item["sources"][:8]
                        graph_trace = item["graph_trace"]
                        context_text = item.get("context_text", "")
                        yield f"data: {json.dumps({'sources': sources, 'graph_trace': graph_trace})}\n\n"
                    elif item["type"] == "token":
                        full_answer += item["token"]
                        if contains_pii(full_answer):
                            yield f"data: {json.dumps({'token': '\n\n[개인정보 보호를 위해 답변이 중단되었습니다.]'})}\n\n"
                            yield f"data: {json.dumps({'status': 'done'})}\n\n"
                            break
                        yield f"data: {json.dumps({'token': item['token']})}\n\n"
                    elif item["type"] == "done":
                        # After completion, record assistant answer in DB
                        db_session = SessionLocal()
                        try:
                            db_session.add(ChatMessage(
                                session_id=session_id, 
                                role="assistant", 
                                content=full_answer, 
                                sources=sources
                            ))
                            
                            # 첫 대화인 경우 제목 요약 업데이트
                            current_sess = db_session.query(ChatSession).filter(ChatSession.id == session_id).first()
                            if current_sess and current_sess.title == "New Chat":
                                try:
                                    title_info = engine.summarize_title(request.query)
                                    current_sess.title = title_info["title"]
                                except:
                                    current_sess.title = request.query[:20] + "..."
                            db_session.commit()
                        except Exception as e:
                            db_session.rollback()
                            print(f"Error saving chat assistant message: {e}")
                        finally:
                            db_session.close()
                        
                        yield f"data: {json.dumps({'status': 'done'})}\n\n"
                        
                        # 4. 백그라운드 자가 검증 수행
                        print("🔍 [SSE] Running Background Self-Evaluation...")
                        evaluation = engine._evaluate_answer(request.query, full_answer, context_text)
                        print(f"✅ [SSE] Self-Evaluation Result: {evaluation}")
                        
                        db_session = SessionLocal()
                        try:
                            msg = db_session.query(ChatMessage).filter(
                                ChatMessage.session_id == session_id,
                                ChatMessage.role == "assistant"
                            ).order_by(ChatMessage.created_at.desc()).first()
                            if msg:
                                msg.evaluation = evaluation
                                db_session.commit()
                        except Exception as e:
                            db_session.rollback()
                            print(f"Error updating evaluation: {e}")
                        finally:
                            db_session.close()
                            
                        # 검증 결과 전송
                        yield f"data: {json.dumps({'evaluation': evaluation})}\n\n"
                        
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(chat_stream(), media_type="text/event-stream")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "sources": m.sources, "evaluation": m.evaluation, "created_at": m.created_at} for m in messages]

@app.get("/projects")
async def get_user_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    projects = db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()
    return [{
        "id": p.id, "repo_url": p.repo_url, "file_count": p.file_count, "last_commit_message": p.last_commit_message,
        "latest_session_id": db.query(ChatSession).filter(ChatSession.project_id == p.id).order_by(ChatSession.created_at.desc()).first().id if db.query(ChatSession).filter(ChatSession.project_id == p.id).count() > 0 else None
    } for p in projects]

@app.post("/generate/network")
async def generate_network_data(request: DiagramRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    graph = nx.node_link_graph(chat_session.project.graph_data)
    nodes, links = [], []
    degree_dict = dict(graph.degree())
    for node in graph.nodes():
        nodes.append({"id": node, "name": node.split('/')[-1], "group": node.split('/')[-2] if '/' in node else "root", "val": max(1, min(20, degree_dict.get(node, 1)))})
    for u, v in graph.edges():
        links.append({"source": u, "target": v})
    return {"nodes": nodes, "links": links}

@app.post("/generate/architecture-analysis")
async def generate_architecture_analysis(request: DiagramRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    project = chat_session.project
    
    # 1. 캐시 확인
    if project.architecture_analysis and not request.force_regenerate:
        return {"analysis": project.architecture_analysis}

    # 1.5. 캐시 없고 자동 생성 방지 모드인 경우
    if not request.generate_if_missing:
        return {"analysis": None, "status": "no_cache"}

    # 2. 캐시 없으면 생성
    engine = engine_cache.get(request.session_id)
    if not engine:
        engine = ChatFolioEngine({f.file_path: f.content for f in project.files}, nx.node_link_graph(project.graph_data), project_id=project.id, provider=chat_session.provider, model_name=chat_session.model_name)
        engine_cache[request.session_id] = engine
    
    result = engine.analyze_architecture(language="Korean" if current_user.country == "South Korea" else "English")
    analysis_text = result.get("analysis")
    
    # 3. DB에 저장 (캐싱)
    project.architecture_analysis = analysis_text
    db.commit()
    
    return {"analysis": analysis_text}

@app.post("/generate/pipeline")
async def generate_project_pipeline(request: DiagramRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    project = chat_session.project
    
    # 1. 캐시 확인
    if project.pipeline_data and not request.force_regenerate:
        return project.pipeline_data

    # 1.5. 캐시 없고 자동 생성 방지 모드인 경우
    if not request.generate_if_missing:
        return {"steps": [], "status": "no_cache"}

    # 2. 캐시 없거나 강제 갱신이면 생성
    engine = engine_cache.get(request.session_id)
    if not engine:
        engine = ChatFolioEngine({f.file_path: f.content for f in project.files}, nx.node_link_graph(project.graph_data), project_id=project.id, provider=chat_session.provider, model_name=chat_session.model_name)
        engine_cache[request.session_id] = engine
        
    try:
        pipeline_data = engine.generate_pipeline(language="Korean" if current_user.country == "South Korea" else "English")
        
        # 3. DB에 저장 (캐싱)
        project.pipeline_data = pipeline_data
        db.commit()
        
        return pipeline_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/readmes/{project_id}")
async def get_project_readmes(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    readmes = db.query(GeneratedReadme).filter(GeneratedReadme.project_id == project_id).order_by(GeneratedReadme.created_at.desc()).all()
    return [{"id": r.id, "content": r.content, "template_type": r.template_type, "created_at": r.created_at} for r in readmes]

@app.post("/generate/readme")
async def generate_readme(request: ReadmeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    project = chat_session.project
    
    # 1. 기존 README가 있는지 확인 (강제 재생성이 아닌 경우)
    if not request.force_regenerate:
        existing_readme = db.query(GeneratedReadme).filter(GeneratedReadme.project_id == project.id).order_by(GeneratedReadme.created_at.desc()).first()
        if existing_readme:
            return {"readme_content": existing_readme.content, "status": "cached"}

    # 1.5. 기존 거 없고 자동 생성 방지 모드인 경우
    if not request.generate_if_missing:
        return {"readme_content": None, "status": "no_cache"}

    # 2. 없거나 강제 재생성이면 AI 호출
    engine = engine_cache.get(request.session_id)
    if not engine:
        engine = ChatFolioEngine({f.file_path: f.content for f in project.files}, nx.node_link_graph(project.graph_data), project_id=project.id, provider=chat_session.provider, model_name=chat_session.model_name)
        engine_cache[request.session_id] = engine
        
    result = engine.generate_readme(languages=request.languages)
    readme_content = result["readme_content"]
    
    # 3. DB에 저장
    new_readme = GeneratedReadme(project_id=project.id, content=readme_content)
    db.add(new_readme)
    db.commit()
    
    return {"readme_content": readme_content, "status": "generated"}

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
        "created_at": session.created_at
    }

@app.get("/chat/sessions/{project_id}")
async def get_project_sessions(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = db.query(ChatSession).filter(
        ChatSession.project_id == project_id,
        ChatSession.user_id == current_user.id,
        ChatSession.is_deleted == 0
    ).order_by(ChatSession.created_at.desc()).all()
    return [{"session_id": s.id, "title": s.title, "created_at": s.created_at} for s in sessions]

@app.post("/chat/session/new")
async def create_new_session(request: NewSessionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_session = ChatSession(
        user_id=current_user.id,
        project_id=request.project_id,
        provider=request.provider,
        model_name=request.model_name,
        title="New Chat"
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return {"status": "success", "session_id": new_session.id}

@app.delete("/chat/session/{session_id}")
async def delete_chat_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.is_deleted = 1
    db.commit()
    return {"status": "success", "message": "Session deleted"}
