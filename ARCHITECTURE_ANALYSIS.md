# ChatFolio 아키텍처 분석 및 최적화 설계서

> **목적:** 현재 RAG 엔진, Graph DB, RDB 설계의 선택 이유를 정리하고, 병목 지점과 구체적인 최적화 방향을 제시한다.

---

## 목차

1. [현재 아키텍처 개요](#1-현재-아키텍처-개요)
2. [RAG 엔진 설계 분석](#2-rag-엔진-설계-분석)
3. [Graph 설계 분석](#3-graph-설계-분석)
4. [데이터베이스 설계 분석](#4-데이터베이스-설계-분석)
5. [파서 시스템 분석](#5-파서-시스템-분석)
6. [전체 병목 지점 요약](#6-전체-병목-지점-요약)
7. [최적화 로드맵](#7-최적화-로드맵)

---

## 1. 현재 아키텍처 개요

```
[GitHub URL]
    │
    ▼
[GitHubFetcher]  ←─ GitHub API (tree + blob)
    │
    ▼
[Parser Factory] ─→ 언어별 AST/Regex 파서 ─→ 메타데이터 JSON
    │
    ├─▶ [PostgreSQL: ProjectFile] (소스 코드 + 메타데이터 전체 저장)
    │
    ▼
[DependencyGraphBuilder]
    │  NetworkX DiGraph (메모리)
    ├─▶ [PostgreSQL: Project.graph_data] (nx.node_link_data JSON으로 직렬화)
    │
    ▼
[ChatFolioEngine] (세션별 인스턴스, TTL 캐시)
    ├─ BGE-M3 임베딩 (HuggingFace, 로컬)
    ├─ Chroma 벡터 DB (디스크: storage/vectors/{project_id})
    ├─ BM25 리트리버 (메모리)
    └─ ms-marco-MiniLM Re-ranker (로컬)
    │
    ▼
[하이브리드 검색] ─→ [Re-ranking] ─→ [컨텍스트 구성] ─→ [LLM]
                                                           ├─ HuggingFace (Qwen)
                                                           └─ Groq (Llama)
```

### 핵심 설계 철학

| 원칙 | 현재 구현 |
|---|---|
| **Zero Cost** | 로컬 임베딩(BGE-M3), 오픈소스 Re-ranker, 무료 Groq API |
| **정확도 우선** | 하이브리드 검색 + 재순위화 + 자가 검증 |
| **코드 의미 이해** | 그래프 기반 이웃 파일 컨텍스트 보강 |
| **캐시 계층화** | 4단계 캐시 (메모리→디스크→DB→Git hash) |

---

## 2. RAG 엔진 설계 분석

### 2.1 임베딩: BAAI/bge-m3

**왜 이걸 골랐나:**
- OpenAI `text-embedding-3-small`은 API 비용 발생 → 분석마다 청구
- BGE-M3은 로컬 실행, 95개 언어 지원, 1536 dim (높은 표현력)
- `langchain-huggingface`로 통합이 간단

**문제점:**
```
현재: ChatFolioEngine.__init__() 마다 모델 로드
      → 세션이 생길 때마다 ~2-5초 대기 (첫 요청 지연)
      → 여러 세션이 동시에 생기면 OOM 위험 (모델 중복 로딩)
```

**최적화 방향:**

```python
# 현재 (문제)
class ChatFolioEngine:
    def __init__(self, ...):
        self.embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-m3")

# 개선: 서버 시작 시 싱글톤으로 한 번만 로드
# main.py
from core.rag.embedding import get_shared_embeddings

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_shared_embeddings()  # 워밍업
    yield

# core/rag/embedding.py
_embeddings = None
def get_shared_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-m3")
    return _embeddings
```

---

### 2.2 청킹 전략: RecursiveCharacterTextSplitter (600자, overlap 50)

**왜 이렇게 했나:**
- 600자는 약 150 토큰 → LLM 컨텍스트 예산 절약
- `\ndef `, `\nclass ` 구분자로 함수/클래스 경계 우선 분리
- 라인 번호 메타데이터를 청크마다 저장하여 소스 위치 추적

**문제점:**

```
케이스 1: 긴 함수 (200줄)
  → 600자로 중간에 잘림
  → 함수 상반부 청크에만 docstring이 포함됨
  → 하반부 청크는 맥락 없이 로직만 존재

케이스 2: 클래스 메서드
  → 클래스 선언부가 한 청크, 메서드들이 다른 청크
  → "User 클래스의 save 메서드" 검색 시 메서드 청크에 클래스명 없음

케이스 3: overlap=50자
  → 함수 경계를 넘기에는 너무 작음
```

**최적화 방향 — AST 기반 의미론적 청킹:**

```python
# 파서가 이미 AST를 분석하므로, 함수/클래스 단위로 청킹 가능
def ast_chunk(file_path: str, content: str, metadata_json: dict) -> list[Document]:
    parsed = metadata_json.get("parsed", {})
    chunks = []

    # 1) 클래스 단위 청크
    for cls in parsed.get("classes", []):
        # 클래스 헤더 + 메서드 목록 → 하나의 청크
        chunk_text = f"# {cls['name']} (class)\n"
        chunk_text += f"inherits: {cls.get('inherits', [])}\n"
        chunk_text += f"methods: {cls.get('methods', [])}\n"
        if cls.get("docstring"):
            chunk_text += cls["docstring"]
        chunks.append(Document(page_content=chunk_text, metadata={
            "path": file_path, "type": "class", "name": cls["name"]
        }))

    # 2) 함수 단위 청크  
    for fn in parsed.get("functions", []):
        chunks.append(...)

    # 3) 남은 내용은 기존 방식으로 처리 (fallback)
    return chunks if chunks else text_splitter.split_documents(...)
```

이렇게 하면 "User 클래스의 save 메서드"를 검색할 때 `class:User`가 포함된 청크가 정확히 매칭된다.

---

### 2.3 하이브리드 검색: 벡터 + BM25

**왜 이렇게 했나:**
- 벡터 검색만 쓰면: `"HTTP 상태코드 처리"` 같은 키워드 기반 검색이 약함
- BM25만 쓰면: `"에러가 발생하면 어떻게 해?"` 같은 의미 기반 검색이 약함
- 두 개를 합치면 상호 보완

**문제점:**

```python
# 현재: 단순 리스트 합산 (중복 제거만)
combined = vector_results + bm25_results  # 순서 = 먼저 온 게 앞

# 문제: 두 검색기의 점수 스케일이 다름
# 벡터 유사도: 0.0 ~ 1.0 (코사인)
# BM25 점수: 0 ~ ∞ (TF-IDF 기반)
# → Re-ranker 전에 이미 "어느 쪽 결과가 앞에 오냐"가 결과에 영향
```

**최적화 방향 — RRF (Reciprocal Rank Fusion):**

```python
def reciprocal_rank_fusion(rankings: list[list[Document]], k=60) -> list[Document]:
    """여러 검색 결과를 순위 기반으로 공정하게 합산."""
    scores: dict[str, float] = {}
    doc_map: dict[str, Document] = {}

    for ranking in rankings:
        for rank, doc in enumerate(ranking):
            key = doc.metadata.get("path", "") + doc.page_content[:50]
            scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
            doc_map[key] = doc

    sorted_keys = sorted(scores, key=scores.__getitem__, reverse=True)
    return [doc_map[k] for k in sorted_keys]

# 사용
vector_results = vector_db.similarity_search(query, k=20)
bm25_results = bm25_retriever.invoke(query)[:20]
fused = reciprocal_rank_fusion([vector_results, bm25_results])
```

---

### 2.4 Re-ranking: cross-encoder/ms-marco-MiniLM-L-6-v2

**왜 이걸 골랐나:**
- Qwen 같은 대형 모델로 Re-rank하면 수십 초 → 사용 불가
- MiniLM (6.7M 파라미터)은 로컬에서 수십ms
- ms-marco는 정보 검색 벤치마크 최상위권
- 이전에 쓰던 Qwen Re-ranker에서 전환 → 속도 10배 향상

**문제점:**
```
현재: candidates[:20]만 Re-rank
→ 21번째 문서가 실제로 가장 관련 있어도 제외됨
→ 벡터/BM25 상위 20개 안에 들어야만 Re-rank 대상
```

**최적화 방향 — 그래프 중요도 가중치 통합:**

```python
def rerank_with_graph_boost(query, candidates, graph, top_n=8):
    # 1) Cross-encoder 점수
    pairs = [[query, doc.page_content] for doc in candidates]
    ce_scores = cross_encoder.predict(pairs)
    
    # 2) 그래프 중심성 점수 (in_degree = 많이 참조될수록 높음)
    max_degree = max(graph.in_degree(n) for n in graph.nodes) or 1
    
    scored = []
    for doc, ce_score in zip(candidates, ce_scores):
        path = doc.metadata.get("path", "")
        graph_score = graph.in_degree(path) / max_degree if path in graph else 0
        
        # 최종 점수 = CE 70% + 그래프 중심성 30%
        final_score = 0.7 * ce_score + 0.3 * graph_score
        scored.append((doc, final_score))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    return [doc for doc, _ in scored[:top_n]]
```

---

### 2.5 컨텍스트 구성: 12KB 고정 한도

**왜 이렇게 했나:**
- Groq Llama-3 8B의 컨텍스트 = 8K 토큰 → 12KB는 약 4K 토큰 (시스템 프롬프트 + 컨텍스트 + 답변 공간 확보)
- 대형 모델(70B)은 32K 이상 지원하지만 통일된 한도 유지

**문제점:**
```
케이스: 모델이 Groq 70B (128K context)인데도 12KB 제한 적용
→ 대형 프로젝트에서 관련 파일을 절반도 못 넣음
```

**최적화 방향 — 모델별 동적 컨텍스트 한도:**

```python
MODEL_CONTEXT_LIMITS = {
    "llama-3.1-8b-instant":       8_000,   # chars
    "llama-3.3-70b-versatile":   60_000,
    "Qwen/Qwen2.5-Coder-7B-Instruct": 16_000,
    "Qwen/Qwen2.5-Coder-32B-Instruct": 48_000,
}

def get_context_limit(provider: str, model_name: str) -> int:
    return MODEL_CONTEXT_LIMITS.get(model_name, 12_000)
```

---

### 2.6 자가 검증 (Self-Evaluation)

**왜 만들었나:**
- 코드 기반 RAG는 파일 경로 환각이 빈번 (`src/utils.py` 대신 `utils.py` 같은 오류)
- Faithfulness 점수로 "컨텍스트 안에 없는 말을 했냐"를 검증
- 사용자가 답변 신뢰도를 수치로 확인 가능

**현재 문제:**
```python
# 검증이 답변 생성 후 동기적으로 실행됨
answer = llm.generate(...)
evaluation = verifier_llm.evaluate(...)  # 추가 LLM 호출 = 추가 지연
```

**최적화 방향 — 비동기 백그라운드 검증:**

```python
# main.py의 /chat 엔드포인트에서
import asyncio

async def save_message_with_eval(session_id, answer, context, query, db):
    # 답변 먼저 저장 (evaluation=None)
    msg = ChatMessage(session_id=session_id, role="assistant", content=answer)
    db.add(msg); db.commit()
    
    # 검증은 백그라운드에서 비동기 실행
    asyncio.create_task(
        run_evaluation_and_update(msg.id, query, answer, context, db)
    )

# SSE 스트림 종료 후 evaluation이 붙어서 오던 걸 → 완전히 분리
# 사용자는 즉시 답변을 받고, 검증 결과는 나중에 폴링하거나 무시
```

---

## 3. Graph 설계 분석

### 3.1 현재 구조: NetworkX + PostgreSQL JSONB

**왜 이렇게 했나:**
- Neo4j 같은 별도 그래프 DB를 띄우면 인프라 복잡도 증가
- NetworkX는 Python 생태계에서 가장 성숙한 그래프 라이브러리
- `nx.node_link_data()`로 JSON 직렬화 → PostgreSQL JSONB에 저장 → 서버 재시작 후 `nx.node_link_graph()`로 복원
- 단일 서버 환경에서는 완전히 충분

**문제점:**

```
문제 1: JSONB 크기 폭증
  - 파일 1000개 프로젝트: graph_data ≈ 5-20 MB
  - PostgreSQL JSONB에 20MB짜리 컬럼은 쿼리마다 전체 역직렬화 발생

문제 2: 그래프 쿼리 불가
  - "A 파일에 의존하는 모든 파일 찾기" = Python 코드로만 가능
  - DB 레벨에서 path finding, 서브그래프 쿼리 없음

문제 3: node_link_data 포맷의 중복성
  - 각 노드에 label, type 등 속성이 반복 저장됨
  - 엣지 수가 많으면 JSON 크기가 기하급수적으로 커짐
```

**현재 저장 포맷 (node_link_data):**
```json
{
  "directed": true,
  "nodes": [
    {"id": "backend/main.py", "label": "main.py", "type": "file"},
    {"id": "backend/api/auth.py", "label": "auth.py", "type": "file"},
    ...  // 파일 수만큼
  ],
  "links": [
    {"source": "backend/main.py", "target": "backend/api/auth.py", "relationship": "DEPENDS_ON"},
    ...  // 임포트 수만큼
  ]
}
```

**최적화 방향 1 — 압축 엣지리스트 포맷:**

```python
# 노드 정보는 ProjectFile 테이블에 이미 있음 → 중복 저장 불필요
# 그래프 저장을 "엣지 리스트"만으로 압축

def compress_graph(graph: nx.DiGraph) -> dict:
    """노드 속성 제거, 엣지만 저장 (파일 경로는 ProjectFile에 이미 존재)"""
    return {
        "edges": [[u, v] for u, v in graph.edges()],
    }

def restore_graph(compressed: dict, file_paths: list[str]) -> nx.DiGraph:
    g = nx.DiGraph()
    g.add_nodes_from(file_paths)
    g.add_edges_from(compressed["edges"])
    return g

# 절약: 노드 속성(label, type) 제거 → 파일 1000개 기준 ~60% 크기 감소
```

**최적화 방향 2 — PageRank로 파일 중요도 사전 계산:**

```python
# 현재: 매 검색마다 in_degree() 실시간 계산
# 개선: 분석 시점에 PageRank 계산 후 ProjectFile.importance_score에 저장

def compute_importance(graph: nx.DiGraph, db_session, project_id: int):
    pagerank = nx.pagerank(graph, alpha=0.85)  # {파일경로: 0.0~1.0}
    
    for file_path, score in pagerank.items():
        importance = int(score * 10000)  # 정수로 저장
        db_session.query(ProjectFile).filter(
            ProjectFile.project_id == project_id,
            ProjectFile.file_path == file_path
        ).update({"importance_score": importance})

# RAG에서 컨텍스트 보강 시 importance_score 기준으로 이웃 파일 정렬
# → 실시간 그래프 순회 없이 DB 조회만으로 핵심 파일 식별
```

---

### 3.2 임포트 해석기 (Resolver)

**왜 이렇게 설계했나:**
- 언어마다 임포트 문법이 달라 단일 로직으로 처리 불가
- Python: `from backend.database.models import User`
- JS: `import { User } from './models'` (상대 경로)
- Java: `import com.example.models.User;` (FQCN)
- 전략 패턴으로 각 언어별 Resolver 분리

**문제점:**

```
Python Resolver:
  "from fastapi import FastAPI"
    → entity_map에서 "fastapi.FastAPI" 찾기 → 없음 (외부 라이브러리)
    → "FastAPI" 찾기 → 없음
    → 처리 없이 넘어감 (정상)

  "from .database import get_db"  ← 상대 임포트
    → "." = 현재 패키지 → 현재 파일 위치 기반으로 해석 필요
    → 현재 구현에서는 상대 임포트가 실패할 수 있음 ⚠️

JS Resolver:
  import X from '../api/index'   ← 상대 경로
    → 현재 파일 위치 + '../api/index' = 절대 경로 계산
    → 확장자 없이 들어올 경우 (.js, .ts, .jsx, .tsx) 시도
    → index 파일 처리: '../api' → '../api/index.ts' 시도 (현재 미구현 가능성)
```

**최적화 방향 — 상대 임포트 처리 강화:**

```python
class PythonResolver:
    def resolve(self, source_file: str, imp: str, ...) -> list[str]:
        # 상대 임포트 처리
        if imp.startswith("."):
            dots = len(imp) - len(imp.lstrip("."))
            # source_file의 상위 디렉토리 dots번 이동
            base_dir = "/".join(source_file.split("/")[:-dots])
            module = imp.lstrip(".")
            candidate = f"{base_dir}/{module.replace('.', '/')}.py"
            if candidate in full_path_map:
                return [candidate]
            # __init__.py도 시도
            candidate_init = f"{base_dir}/{module.replace('.', '/')}/__init__.py"
            if candidate_init in full_path_map:
                return [candidate_init]
        # ... 기존 로직
```

---

## 4. 데이터베이스 설계 분석

### 4.1 전체 구조 선택 이유

**PostgreSQL + SQLAlchemy 선택 이유:**
- 개발 → 프로덕션 전환 시 SQLite에서 PG로 교체 없이 바로 적용
- JSONB 타입으로 그래프 데이터, 파서 메타데이터를 스키마 변경 없이 저장
- 동시 접속 처리 (SQLite는 write lock 문제)

### 4.2 핵심 설계 결정과 문제점

#### ProjectFile: 소스 코드 전체를 DB에 저장

```sql
-- 현재
CREATE TABLE project_files (
    id SERIAL PRIMARY KEY,
    project_id INT,
    file_path VARCHAR,     -- 인덱스 있음
    content TEXT,          -- ← 소스 코드 전체! 파일당 최대 수백 KB
    metadata_json JSONB,   -- ← 파서 결과
    ...
);
```

**왜 이렇게 했나:**
- 배포 시 파일 시스템에 의존하지 않기 위해 (컨테이너 재시작 내성)
- BM25 리트리버가 DB에서 content를 로드해서 인메모리 인덱스 구성
- 다음 번 RAG 엔진 초기화 시 파일을 다시 GitHub에서 클론하지 않아도 됨

**문제점:**
```
파일 500개, 평균 50KB → project_files 테이블: 25MB/프로젝트
PostgreSQL에서 TEXT 컬럼 전체 로드 → BM25 구성 시 한 번에 25MB 메모리 적재
```

**최적화 방향 — 콘텐츠 요약 활용:**

```python
# 현재: BM25가 content(원본 코드) 전체를 사용
# 개선: 파서가 추출한 키워드 + 함수/클래스명 + content의 첫 200줄만 사용

def build_bm25_corpus(files: list[ProjectFile]) -> list[str]:
    corpus = []
    for f in files:
        parsed = f.metadata_json.get("parsed", {})
        
        # 구조화된 정보 + 원본 일부만
        keywords = " ".join(f.keywords or [])
        classes = " ".join(c["name"] for c in parsed.get("classes", []))
        functions = " ".join(fn["name"] for fn in parsed.get("functions", []))
        content_head = (f.content or "")[:3000]  # 첫 3000자만
        
        corpus.append(f"{keywords} {classes} {functions} {content_head}")
    return corpus

# 메모리: 25MB → ~2MB (90% 감소)
# BM25 정확도: 오히려 향상 (노이즈 제거)
```

---

#### Project.graph_data: JSONB에 그래프 저장

**왜 이렇게 했나:**
- 별도 그래프 DB 없이 구현 단순화
- nx.node_link_data/graph로 직렬화/역직렬화가 한 줄

**문제점:**
```sql
-- 20MB짜리 JSONB를 Project 행마다 로드
SELECT * FROM projects WHERE user_id = ?;
-- → graph_data 컬럼도 같이 로드됨 (조인 시 성능 저하)
```

**최적화 방향 — 그래프 데이터 분리 테이블:**

```sql
-- graph_data를 별도 테이블로 분리 (지연 로딩 가능)
CREATE TABLE project_graphs (
    project_id INT PRIMARY KEY REFERENCES projects(id),
    edge_list JSONB NOT NULL,   -- [[source, target], ...] 형식 (압축)
    node_count INT,
    edge_count INT,
    pagerank JSONB,             -- {file_path: score} 사전 계산값
    updated_at TIMESTAMP
);

-- projects 테이블에서 graph_data 컬럼 제거
-- → 프로젝트 목록 조회 시 불필요한 20MB JSONB 로딩 없음
```

---

#### 누락된 인덱스

```sql
-- 현재 있는 인덱스
CREATE INDEX ON project_files(file_path);

-- 없어서 문제인 인덱스들
-- 1) 채팅 히스토리 로딩 (매 질문마다 실행)
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);

-- 2) 세션 목록 조회 (DashboardLayout 사이드바)
CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id, is_deleted, created_at DESC);

-- 3) 프로젝트 목록 조회
CREATE INDEX idx_projects_user_status ON projects(user_id, status);

-- 4) 파일 중요도 기반 정렬 (RAG 컨텍스트 보강)
CREATE INDEX idx_project_files_importance ON project_files(project_id, importance_score DESC);
```

SQLAlchemy 모델에 추가:
```python
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("idx_chat_messages_session", "session_id", "created_at"),
    )

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("idx_chat_sessions_project", "project_id", "is_deleted", "created_at"),
    )
```

---

#### 채팅 히스토리: 마지막 10개 고정 로딩

**왜 이렇게 했나:**
- LLM 컨텍스트 한도 내에서 과거 대화 제공
- 10개 = 대략 5턴 (질문 5 + 답변 5)

**문제점:**
```
긴 대화에서 초반 컨텍스트 유실:
  Q1: "이 프로젝트의 DB 구조 설명해줘"  ← 10개 넘으면 사라짐
  ...9개 이후...
  Q11: "아까 말한 DB 테이블 다시 정리해줘"
       → 모델이 Q1 맥락 없이 답변 → 엉뚱한 답
```

**최적화 방향 — 대화 압축 (Conversation Compression):**

```python
def get_compressed_history(session_id: str, db: Session) -> list[dict]:
    all_messages = db.query(ChatMessage)\
        .filter_by(session_id=session_id)\
        .order_by(ChatMessage.created_at)\
        .all()
    
    if len(all_messages) <= 10:
        return [{"role": m.role, "content": m.content} for m in all_messages]
    
    # 최근 6개는 원본 유지
    recent = all_messages[-6:]
    older = all_messages[:-6]
    
    # 이전 대화는 LLM으로 압축 요약 (짧은 경량 모델 사용)
    summary_prompt = f"다음 대화를 3문장으로 핵심만 요약:\n{format_messages(older)}"
    summary = lightweight_llm.invoke(summary_prompt)
    
    return [
        {"role": "system", "content": f"[이전 대화 요약]\n{summary}"},
        *[{"role": m.role, "content": m.content} for m in recent]
    ]
```

---

## 5. 파서 시스템 분석

### 5.1 현재 구조

**왜 언어별 파서를 만들었나:**
- Tree-sitter 기반 파서는 정확하지만 언어마다 문법 파일 필요
- Python은 ast 모듈이 내장되어 있어 외부 의존성 없이 정확
- Java/JS는 정규식 기반 → 복잡한 경우 오파싱 가능성

### 5.2 문제점

**Python 파서 (ast 기반):**
```python
# 현재 이슈: 소스 코드에 문법 오류가 있으면 전체 파싱 실패
try:
    tree = ast.parse(self.content)
except SyntaxError:
    return {}  # 전체 메타데이터 유실

# 개선: 부분 파싱 (에러 발생 라인 전까지)
# → Python 3.8+의 ast.parse(mode='exec', type_comments=True) 활용
# → 혹은 libcst로 에러 내성 파싱
```

**JS/TS 파서 (정규식 기반):**
```python
# 문제: JSX 컴포넌트의 props 타입, TypeScript 제네릭 파싱 못 함
# 예: import type { User } from '@/types'  ← type-only import
# 예: const fn = async <T extends Base>(arg: T): Promise<T> => {}

# 개선: @typescript/parser 또는 tree-sitter-typescript 활용
```

### 5.3 최적화 방향 — 병렬 파싱

```python
# 현재: 파일을 순서대로 파싱
for path, content in file_generator:
    meta = get_parser_result(path, content)  # 동기 처리

# 개선: 멀티스레딩으로 CPU 병렬 활용
from concurrent.futures import ThreadPoolExecutor

def parse_files_parallel(files: list[tuple[str, str]]) -> dict:
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(get_parser_result, path, content): path
            for path, content in files
        }
        results = {}
        for future in as_completed(futures):
            path = futures[future]
            results[path] = future.result()
    return results

# 예상 효과: 파일 200개 기준 파싱 시간 ~60% 단축
```

---

## 6. 전체 병목 지점 요약

| 우선순위 | 병목 | 원인 | 예상 영향 |
|:---:|---|---|---|
| 🔴 **1** | 임베딩 모델 반복 로드 | ChatFolioEngine 생성마다 BGE-M3 초기화 | 세션 생성 2-5초 지연, 메모리 중복 |
| 🔴 **2** | JSONB graph_data 크기 | node_link_data 포맷이 노드 속성 중복 저장 | 대형 프로젝트 쿼리 성능 저하 |
| 🟠 **3** | BM25 코퍼스 크기 | 소스 코드 전체 내용 사용 | 메모리 사용 과다 |
| 🟠 **4** | 누락 DB 인덱스 | chat_messages, chat_sessions 인덱스 없음 | 채팅 로딩 N+1 쿼리 |
| 🟠 **5** | 단순 결과 합산 | RRF 없이 리스트 concat | 검색 품질 저하 |
| 🟡 **6** | 자가 검증 동기 실행 | 답변 후 추가 LLM 호출 | SSE 종료 지연 |
| 🟡 **7** | 대화 히스토리 고정 10개 | 압축 없이 잘라냄 | 긴 대화 컨텍스트 유실 |
| 🟡 **8** | 청킹이 AST 미활용 | 단순 글자 수 기반 분리 | 클래스/함수 경계 파편화 |
| 🟢 **9** | 상대 임포트 해석 미흡 | Python/JS 상대 경로 처리 | 그래프 엣지 누락 |
| 🟢 **10** | 파싱 순차 처리 | 병렬화 없음 | 분석 시간 불필요하게 김 |

---

## 7. 최적화 로드맵

### Phase A — 즉시 적용 (1-2일)

```
☐ 임베딩 모델 싱글톤화 (core/rag/embedding.py)
  → 서버 시작 시 한 번 로드, 모든 엔진이 공유
  
☐ DB 인덱스 추가 (database/models.py)
  → chat_messages, chat_sessions, projects 복합 인덱스

☐ BM25 코퍼스 경량화
  → content 전체 대신 keywords + 함수명 + 첫 3000자
```

### Phase B — 단기 최적화 (1주)

```
☐ RRF 기반 하이브리드 검색 결합
  → 현재 단순 합산 → Reciprocal Rank Fusion 적용
  
☐ 그래프 저장 포맷 압축
  → node_link_data → edge_list 전용 + 분리 테이블

☐ PageRank 사전 계산 + ProjectFile.importance_score 갱신
  → 분석 완료 시점에 계산, 실시간 순회 제거

☐ 자가 검증 비동기화
  → asyncio.create_task()로 백그라운드 분리
```

### Phase C — 중기 개선 (2-4주)

```
☐ AST 기반 의미론적 청킹
  → 파서의 classes/functions 정보 활용
  → 함수/클래스 단위 청크 생성

☐ 모델별 동적 컨텍스트 한도
  → MODEL_CONTEXT_LIMITS 딕셔너리로 관리

☐ 대화 압축 (Conversation Compression)
  → 오래된 대화를 요약으로 대체

☐ 파일 병렬 파싱
  → ThreadPoolExecutor(max_workers=4)

☐ Python/JS 상대 임포트 해석 강화
  → 점(.) 기반 상대 경로 처리 로직 추가
```

### Phase D — 장기 구조 개선 (검토 필요)

```
[ 검토 항목 ]
- Qdrant Cloud 전환 (Chroma 대비 분산 환경 지원)
- 소스 코드 콘텐츠 → 오브젝트 스토리지 (S3/MinIO)
  DB에는 경로만 저장, 요청 시 스트리밍
- Celery + Redis로 분석 작업 큐 이관
  현재 Thread 기반 → 분산 환경에서 소실 위험
```

---

> 작성일: 2026-05-18  
> 대상 브랜치: main  
> 분석 기준 커밋: 현재 HEAD
