from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# 데이터베이스 연결 URL
# Docker Compose 사용 시 서비스 이름을 호스트로 사용합니다.
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://user:password@db:5432/chatfolio"
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=20,          # 기본 커넥션 풀 크기
    max_overflow=30,       # 최대 초과 생성 커넥션 (총합 최대 50개 커넥션 지원)
    pool_timeout=60,       # 커넥션 획득 대기 최대 시간 (초)
    pool_recycle=1800      # 커넥션 자동 재연결 주기 (초)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# DB 세션 의존성 주입을 위한 함수
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
