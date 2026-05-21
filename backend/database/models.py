import logging
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .database import Base, engine

logger = logging.getLogger(__name__)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, index=True) # 'github' or 'google'
    email = Column(String, unique=True, index=True, nullable=True)
    name = Column(String)
    github_username = Column(String, unique=True, index=True, nullable=True)
    github_token = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    country = Column(String, nullable=True) # 사용자 국가
    job = Column(String, nullable=True) # 사용자 직업
    tier = Column(String, default="free") # 'free', 'pro'
    pro_expires_at = Column(DateTime, nullable=True) # Pro 등급 만료일
    persona_data = Column(JSONB, nullable=True) # 개발자 MBTI (Persona) 데이터 저장
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="user", cascade="all, delete")
    sessions = relationship("ChatSession", back_populates="user", cascade="all, delete")
    token_usages = relationship("TokenUsage", back_populates="user", cascade="all, delete")

class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index("idx_projects_user_status", "user_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True) # 기존 데이터 호환을 위해 nullable=True
    repo_url = Column(String, index=True)
    file_count = Column(Integer)
    node_count = Column(Integer)
    edge_count = Column(Integer)
    graph_data = Column(JSONB, nullable=True) # 직렬화된 NetworkX 그래프 저장
    mermaid_code = Column(Text, nullable=True) # 생성된 Mermaid 다이어그램 캐싱
    status = Column(String, default="COMPLETED") # 분석 상태
    languages = Column(JSONB, nullable=True) # GitHub 언어 통계 데이터 저장 (Bytes)
    last_commit_hash = Column(String, nullable=True)
    last_commit_message = Column(Text, nullable=True)
    pipeline_data = Column(JSONB, nullable=True) # 생성된 파이프라인 캐싱
    architecture_analysis = Column(Text, nullable=True) # AI 아키텍처 분석 리포트 캐싱
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete")
    sessions = relationship("ChatSession", back_populates="project", cascade="all, delete")
    readmes = relationship("GeneratedReadme", back_populates="project", cascade="all, delete")
    insight = relationship("ProjectInsight", back_populates="project", uselist=False, cascade="all, delete")

class ProjectFile(Base):
    __tablename__ = "project_files"
    __table_args__ = (
        Index("idx_project_files_importance", "project_id", "importance_score"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    file_path = Column(String, index=True)
    content = Column(Text)
    content_summary = Column(Text, nullable=True) # 요약본
    importance_score = Column(Integer, default=0) # 참조 횟수 기반
    keywords = Column(JSONB, nullable=True)
    line_count = Column(Integer, default=0)
    file_size = Column(Integer, default=0)
    metadata_json = Column(JSONB, nullable=True)

    project = relationship("Project", back_populates="files")

class GeneratedReadme(Base):
    __tablename__ = "generated_readmes"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    content = Column(Text)
    template_type = Column(String, default="default")
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="readmes")

class ProjectInsight(Base):
    __tablename__ = "project_insights"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    tech_stack = Column(JSONB, nullable=True)
    summary = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="insight")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("idx_chat_sessions_project", "project_id", "is_deleted", "created_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    provider = Column(String, default="groq")
    model_name = Column(String, nullable=True)
    title = Column(String, default="New Chat")
    is_deleted = Column(Integer, default=0) # 0: Active, 1: Deleted
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    project = relationship("Project", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("idx_chat_messages_session", "session_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    role = Column(String) # 'user' or 'assistant'
    content = Column(Text)
    sources = Column(JSONB, nullable=True) # AI가 참고한 출처 (JSON)
    evaluation = Column(JSONB, nullable=True) # AI 자가 검증 결과 (JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")

class Inquiry(Base):
    __tablename__ = "inquiries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="inquiries")

class TokenUsage(Base):
    __tablename__ = "token_usages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    model_name = Column(String, index=True)
    feature_name = Column(String, index=True) # 'Chat', 'Analyze', 'Readme', 'Architecture', 'Interview'
    token_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="token_usages")

import time
from sqlalchemy.exc import OperationalError

# 테이블 생성 함수
def init_db():
    retries = 5
    while retries > 0:
        try:
            Base.metadata.create_all(bind=engine)
            # [Migration Hack] persona_data 컬럼이 없는 경우 수동 추가
            from sqlalchemy import text
            with engine.connect() as conn:
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS persona_data JSONB"))
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR"))
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS job VARCHAR"))
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR DEFAULT 'free'"))
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMP"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS languages JSONB"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_commit_hash VARCHAR"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_commit_message TEXT"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS pipeline_data JSONB"))
                    conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_analysis TEXT"))
                    # ProjectFile 컬럼 추가
                    conn.execute(text("ALTER TABLE project_files ADD COLUMN IF NOT EXISTS keywords JSONB"))
                    conn.execute(text("ALTER TABLE project_files ADD COLUMN IF NOT EXISTS line_count INTEGER DEFAULT 0"))
                    conn.execute(text("ALTER TABLE project_files ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0"))
                    conn.execute(text("ALTER TABLE project_files ADD COLUMN IF NOT EXISTS metadata_json JSONB"))
                    # ChatSession 컬럼 추가
                    conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS title VARCHAR DEFAULT 'New Chat'"))
                    conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0"))
                    conn.execute(text("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS evaluation JSONB"))
                    # Drop unique constraint on generated_readmes if exists (for migration to multi-readme history)
                    conn.execute(text("ALTER TABLE generated_readmes DROP CONSTRAINT IF EXISTS generated_readmes_project_id_key"))
                    # Composite indexes for hot query paths
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions (project_id, is_deleted, created_at)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects (user_id, status)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_project_files_importance ON project_files (project_id, importance_score)"))
                    conn.commit()
                except Exception as e:
                    logger.error("Migration error: %s", e)
            logger.info("Database initialized successfully.")
            break
        except OperationalError:
            retries -= 1
            logger.warning("Database not ready. Retrying... (%d left)", retries)
            time.sleep(2)
    else:
        logger.error("Could not connect to the database.")
