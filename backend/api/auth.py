import os
from datetime import datetime, timedelta
from typing import Optional
import jwt
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from fastapi_sso.sso.github import GithubSSO
from github import Github, Auth
from sqlalchemy import func

from database.database import get_db
from database.models import User, Project, GeneratedReadme, ProjectFile, ChatSession
from core.parser.github_fetcher import GitHubFetcher

from core.rag.engine import ChatFolioEngine

router = APIRouter(prefix="/auth", tags=["auth"])

# 환경 변수에서 OAuth 정보 가져오기
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

_jwt_secret = os.getenv("JWT_SECRET_KEY")
if not _jwt_secret:
    import sys
    _env = os.getenv("ENV", "development")
    if _env == "production":
        sys.exit("FATAL: JWT_SECRET_KEY is not set. Server startup aborted.")
    _jwt_secret = "fallback_secret_key_for_dev_only"
JWT_SECRET_KEY = _jwt_secret
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost")

# SSO 객체 초기화 (Redirect URI는 프론트엔드가 아니라 백엔드의 callback 주소입니다)
github_sso = GithubSSO(
    client_id=GITHUB_CLIENT_ID,
    client_secret=GITHUB_CLIENT_SECRET,
    redirect_uri=GITHUB_REDIRECT_URI,
    allow_insecure_http=True, # 개발 환경(http) 허용
    scope=["user:email", "repo"] # 프라이빗 레포지토리 접근 권한 추가
)

# JWT 생성 유틸리티
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# 현재 로그인한 사용자 검증 (Dependency)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="토큰 검증에 실패했습니다.")
    
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user

# 공통 소셜 로그인 콜백 처리 로직
async def process_sso_login(sso_user, provider: str, db: Session, github_username: str = None, github_token: str = None):
    # 이메일로 기존 사용자 찾기
    user = db.query(User).filter(User.email == sso_user.email).first()
    
    if not user:
        # 없으면 새로 생성
        user = User(
            provider=provider,
            email=sso_user.email,
            name=sso_user.display_name or sso_user.email.split('@')[0],
            avatar_url=sso_user.picture,
            github_username=github_username,
            github_token=github_token
        )
        db.add(user)
    else:
        # 정보 업데이트
        user.name = sso_user.display_name or user.name
        user.avatar_url = sso_user.picture or user.avatar_url
        if github_username:
            user.github_username = github_username
        if github_token:
            user.github_token = github_token
    
    db.commit()
    db.refresh(user)
    
    # JWT 발급
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    # 프론트엔드로 리다이렉트 (토큰 포함)
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={access_token}")

# 현재 사용자 정보 조회
@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    # 만료 여부 체크 및 처리
    current_tier = current_user.tier
    if current_user.tier == "pro" and current_user.pro_expires_at:
        if datetime.utcnow() > current_user.pro_expires_at:
            current_tier = "free"
            # DB에도 반영 (선택 사항, 여기서는 응답에서만 처리하거나 추후 배치를 돌릴 수 있음)

    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "github_username": current_user.github_username,
        "avatar_url": current_user.avatar_url,
        "provider": current_user.provider,
        "country": current_user.country,
        "job": current_user.job,
        "tier": current_tier,
        "pro_expires_at": current_user.pro_expires_at
    }

# 등급 업그레이드 (결제 시뮬레이션)
@router.post("/upgrade")
async def upgrade_tier(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.tier = "pro"
    # 현재 시간으로부터 30일 뒤 만료
    current_user.pro_expires_at = datetime.utcnow() + timedelta(days=30)
    db.commit()
    db.refresh(current_user)
    
    return {
        "status": "success",
        "message": "Successfully upgraded to Pro tier for 30 days.",
        "tier": current_user.tier,
        "expires_at": current_user.pro_expires_at
    }

# 유저 마이페이지 프로필 정보 조회
@router.get("/profile/{username}")
async def get_user_profile(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.github_username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    
    # 완료된 프로젝트 데이터만 가져오기
    projects = db.query(Project).filter(Project.user_id == user.id, Project.status == "COMPLETED").all()
    
    # 스킬 통계 (Github API Languages 활용)
    lang_stats = {}
    token = user.github_token or os.getenv("GITHUB_TOKEN")
    
    if token and projects:
        try:
            auth = Auth.Token(token)
            g = Github(auth=auth)
            changed = False
            for p in projects:
                # 1. DB에 저장된 언어 정보가 있으면 활용
                if p.languages:
                    for lang, byte_count in p.languages.items():
                        if isinstance(byte_count, int):
                            lang_stats[lang] = lang_stats.get(lang, 0) + byte_count
                    continue
                
                # 2. DB에 없으면 GitHub API 호출 후 저장
                repo_path = p.repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
                try:
                    repo = g.get_repo(repo_path)
                    langs = repo.get_languages()
                    p.languages = langs # DB 캐싱
                    changed = True
                    
                    for lang, byte_count in langs.items():
                        if isinstance(byte_count, int):
                            lang_stats[lang] = lang_stats.get(lang, 0) + byte_count
                except Exception as repo_err:
                    print(f"Failed to fetch languages for {repo_path}: {repo_err}")
            
            if changed:
                db.commit() # 한 번에 커밋
        except Exception as e:
            print(f"Failed to fetch languages from GitHub API: {e}")
            
    # GitHub API에서 언어 정보를 가져오지 못했다면 기존 Insight 정보 활용 (가장 빠름)
    if not lang_stats:
        from database.models import ProjectInsight
        insights = db.query(ProjectInsight).join(Project).filter(Project.user_id == user.id).all()
        for ins in insights:
            if ins.tech_stack and "language_distribution" in ins.tech_stack:
                for lang, count in ins.tech_stack["language_distribution"].items():
                    lang_stats[lang] = lang_stats.get(lang, 0) + count

    # 상위 6개 언어만 추출
    sorted_skills = sorted(lang_stats.items(), key=lambda x: x[1], reverse=True)[:6]
    skills = {k: v for k, v in sorted_skills if v > 0}

    # 생성된 자산
    readmes = db.query(GeneratedReadme).join(Project).filter(Project.user_id == user.id).order_by(GeneratedReadme.created_at.desc()).limit(10).all()
    
    return {
        "user": {
            "name": user.name,
            "avatar_url": user.avatar_url,
            "github_username": user.github_username,
            "country": user.country,
            "job": user.job,
            "tier": user.tier,
            "pro_expires_at": user.pro_expires_at,
            "created_at": user.created_at
        },
        "skills": skills,
        "projects": [
            {
                "id": p.id,
                "repo_url": p.repo_url,
                "file_count": p.file_count,
                "created_at": p.created_at,
                "status": p.status,
                "has_readme": len(p.readmes) > 0 if p.readmes else False,
                "has_diagram": p.mermaid_code is not None,
                "latest_session_id": (
                    db.query(ChatSession.id)
                    .filter(ChatSession.project_id == p.id)
                    .order_by(ChatSession.created_at.desc())
                    .limit(1)
                    .scalar()
                )
            } for p in projects
        ],
        "assets": {
            "readmes": [
                {
                    "id": r.id, 
                    "project_id": r.project_id, 
                    "repo_url": r.project.repo_url, 
                    "content": r.content, # 실제 내용 추가
                    "created_at": r.created_at, 
                    "latest_session_id": (
                        db.query(ChatSession.id)
                        .filter(ChatSession.project_id == r.project_id)
                        .order_by(ChatSession.created_at.desc())
                        .limit(1)
                        .scalar()
                    )
                } for r in readmes
            ],
            "diagrams": [
                {
                    "id": p.id, 
                    "repo_url": p.repo_url, 
                    "mermaid_code": p.mermaid_code, # 다이어그램 코드 추가
                    "created_at": p.created_at, 
                    "latest_session_id": (
                        db.query(ChatSession.id)
                        .filter(ChatSession.project_id == p.id)
                        .order_by(ChatSession.created_at.desc())
                        .limit(1)
                        .scalar()
                    )
                } for p in projects if p.mermaid_code
            ]
        }
    }

# 깃허브 레포지토리 목록 조회
@router.get("/github/repos")
async def get_github_repos(current_user: User = Depends(get_current_user)):
    # 토큰이 없으면 환경변수 GITHUB_TOKEN이라도 시도
    token = current_user.github_token or os.getenv("GITHUB_TOKEN")
    if not token:
        # 토큰이 아예 없으면 빈 리스트 반환 (에러 대신)
        return []
    
    try:
        auth = Auth.Token(token)
        g = Github(auth=auth)
        
        # 본인의 레포지토리 최신순 20개
        repos = g.get_user().get_repos(sort="updated", direction="desc")
        
        return [
            {
                "name": r.name,
                "full_name": r.full_name,
                "html_url": r.html_url,
                "description": r.description,
                "language": r.language,
                "stargazers_count": r.stargazers_count,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None
            } for r in repos[:20]
        ]
    except Exception as e:
        print(f"GitHub API Error: {e}")
        return []

# 라우터 - GitHub
@router.get("/github/login")
async def github_login():
    with github_sso:
        return await github_sso.get_login_redirect()

@router.get("/github/callback")
async def github_callback(request: Request, db: Session = Depends(get_db)):
    # 1. 깃허브로부터 access_token 직접 획득
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Code not found")
    
    import httpx
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI
            },
            headers={"Accept": "application/json"}
        )
        token_data = token_response.json()
        github_token = token_data.get("access_token")
        
    if not github_token:
        raise HTTPException(status_code=400, detail="Failed to get access token from GitHub")

    # 2. 유저 정보 획득 (PyGithub 사용)
    # PyGithub은 동기 라이브러리이므로 필요시 run_in_threadpool 등을 고려할 수 있으나 
    # 여기서는 간단히 직접 호출
    auth = Auth.Token(github_token)
    g = Github(auth=auth)
    gh_user = g.get_user()
    
    # SSOUser 인터페이스와 유사하게 데이터 구조화 (ImportError 방지)
    class GithubUser:
        def __init__(self, id, email, display_name, picture):
            self.id = id
            self.email = email
            self.display_name = display_name
            self.picture = picture
            self.provider = "github"
    
    sso_user = GithubUser(
        id=str(gh_user.id),
        email=gh_user.email or f"{gh_user.login}@github.com",
        display_name=gh_user.name or gh_user.login,
        picture=gh_user.avatar_url
    )
    
    github_username = gh_user.login
        
    return await process_sso_login(sso_user, "github", db, github_username=github_username, github_token=github_token)


