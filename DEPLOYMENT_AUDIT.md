# 🚀 ChatFolio 프로덕션 배포 및 코드 감사 보고서 (Deployment Audit Report)

본 문서는 현재 **ChatFolio** 프로젝트를 실제 상용 환경(Production)에 배포한다고 가정했을 때 발생하는 **하드코딩 요소, 보안 취약점, 아키텍처/성능 병목, DevOps 및 인프라 개선점**을 종합적으로 분석한 보고서입니다. 향후 코드 리팩토링 및 안정적인 배포 설계를 위한 지침으로 활용하시기 바랍니다.

---

## 📑 목차
1. [🚨 1. 치명적인 하드코딩 문제 (Critical Hardcoded Endpoints)](#-1-치명적인-하드코딩-문제-critical-hardcoded-endpoints)
2. [🛡️ 2. 보안 및 인증 취약점 (Security & Authentication Risks)](#-2-보안-및-인증-취약점-security--authentication-risks)
3. [🏗️ 3. 아키텍처 및 상태 관리 한계 (Architecture & Scalability Bottlenecks)](#-3-아키텍처-및-상태-관리-한계-architecture--scalability-bottlenecks)
4. [🐳 4. DevOps 및 인프라 설정 (DevOps & Infrastructure)](#-4-devops-및-인프라-설정-devops--infrastructure)
5. [💡 5. 코드 품질 및 리팩토링 제안 (Refactoring & Clean Code)](#-5-코드-품질-및-리팩토링-제안-refactoring--clean-code)
6. [📋 6. 단계별 조치 체크리스트 (Action Plan)](#-6-단계별-조치-체크리스트-action-plan)

---

## 🚨 1. 치명적인 하드코딩 문제 (Critical Hardcoded Endpoints)

> [!WARNING]
> 로컬호스트(`http://localhost:8000` 및 `http://localhost`)가 코드 전반에 하드코딩되어 있어, 클라우드 환경(AWS, Railway 등) 배포 시 사용자 브라우저에서 API 호출 및 OAuth 로그인이 100% 실패하게 됩니다.

### 1.1. 프론트엔드 API 호출 파편화 및 하드코딩
프론트엔드의 `src/api/index.js` 파일에 API 통신 모듈(`api` 객체, `BASE_URL`)이 설계되어 있음에도 불구하고, 다수의 주요 페이지 및 컴포넌트에서 이를 무시하고 **`fetch('http://localhost:8000/...')`** 형태의 직접 통신 코드가 작성되어 있습니다.

| 파일명 | 하드코딩 라인 번호 / 내용 | 문제점 및 증상 |
| :--- | :--- | :--- |
| `src/api/index.js` | `const BASE_URL = 'http://localhost:8000'` | 배포 시 백엔드 도메인으로의 전환 불가 |
| `src/pages/Login.jsx` | `window.location.href = 'http://localhost:8000/auth/github/login'` | 로그인 버튼 클릭 시 사용자의 로컬호스트로 이동 |
| `src/App.jsx` | `fetch('http://localhost:8000/auth/me', ...)` | 새로고침 시 인증 상태 체크 불가 (로그아웃됨) |
| `src/pages/AuthCallback.jsx` | `fetch('http://localhost:8000/auth/me', ...)` | 소셜 로그인 성공 직후 유저 정보 조회 실패 |
| `src/pages/Chat.jsx` | `fetch('http://localhost:8000/chat/session/...', ...)` | 세션 생성 및 채팅 내역 조회 불가 |
| `src/pages/FAQ.jsx` | `fetch('http://localhost:8000/inquiries', ...)` | 문의하기 폼 제출 불가 |
| `src/pages/Analysis.jsx` | `fetch('http://localhost:8000/projects', ...)` | 저장소 분석 요청 및 내역 조회 불가 |
| `src/components/DashboardLayout.jsx`| `fetch('http://localhost:8000/projects', ...)` | 좌측 사이드바 프로젝트 목록 로드 불가 |

**💡 개선 방향:**
* 모든 하드코딩된 `fetch` 호출을 **`src/api/index.js`의 서비스 함수(`projectService`, `authService`, `chatService` 등)** 로 전면 통합합니다.
* `src/api/index.js`의 `BASE_URL`을 동적 환경 변수(`import.meta.env.VITE_API_BASE_URL`)로 전환합니다.
  ```javascript
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
  ```

### 1.2. 백엔드 OAuth 리다이렉트 URI 하드코딩
백엔드의 `backend/api/auth.py` 파일 내에 GitHub OAuth 및 콜백 주소가 로컬호스트로 박혀 있습니다.

```python
# backend/api/auth.py (L31, L101, L322)
github_sso = GithubSSO(
    client_id=GITHUB_CLIENT_ID,
    client_secret=GITHUB_CLIENT_SECRET,
    redirect_uri="http://localhost:8000/auth/github/callback", # 하드코딩!
    ...
)

async def process_sso_login(...):
    ...
    frontend_url = f"http://localhost/auth/callback?token={access_token}" # 하드코딩!
```

**💡 개선 방향:**
* `redirect_uri`를 `.env`의 `GITHUB_REDIRECT_URI` 또는 서버 API 호스트 기반 동적 주소로 주입합니다.
* `frontend_url` 또한 환경 변수(`FRONTEND_URL` = `https://chatfolio.com` 등)를 참조하도록 변경해야 콜백 이후 정상적으로 앱 메인으로 리다이렉트됩니다.

---

## 🛡️ 2. 보안 및 인증 취약점 (Security & Authentication Risks)

> [!CAUTION]
> 현재 보안 설정은 로컬 테스트 환경 편의성에 초점이 맞춰져 있어, 프로덕션 배포 시 보안 사고(XSS, 세션 탈취, 무단 API 호출)의 위험이 높습니다.

### 2.1. CORS 정책의 전면 개방
* **현황:** `backend/main.py`의 `CORSMiddleware` 설정에서 `allow_origins=["*"]`를 사용하여 모든 도메인에서의 접근을 무제한 허용하고 있습니다.
* **위험성:** CSRF 공격 및 제3자 웹사이트에서의 무단 API 호출(리소스 및 LLM 토큰 도용)이 가능합니다.
* **개선책:** 프로덕션 환경 변수(`ALLOWED_ORIGINS`)를 통해 실제 서비스되는 프론트엔드 도메인(`https://chatfolio.app`, `https://api.chatfolio.app`)만 화이트리스트로 제한해야 합니다.

### 2.2. JWT 시크릿 키 관리 및 Fail-Fast 정책 부재
* **현황:** `backend/api/auth.py`에서 `JWT_SECRET_KEY`가 없을 경우 `"fallback_secret_key_if_not_set"`을 기본값으로 사용합니다.
* **위험성:** 클라우드 컨테이너에 실수로 환경 변수가 주입되지 않았을 때, 누구나 알고 있는 취약한 기본 키로 서버가 실행되어 토큰 위조가 가능해집니다.
* **개선책:** 배포 시점(Production)에는 시크릿 키가 없을 경우 서버가 기동하지 않고 즉시 에러를 발생시키는 **Fail-Fast** 로직으로 전환해야 합니다.

### 2.3. 토큰 브라우저 평문 저장 (XSS 취약점)
* **현황:** `localStorage.setItem('token', token)` 방식으로 브라우저 로컬 스토리지에 JWT를 평문으로 보관하고 있습니다.
* **위험성:** 사이트 내 악성 스크립트가 실행될 수 있는 XSS 취약점 발생 시, 자바스크립트를 통해 유저 토큰이 즉시 탈취됩니다.
* **개선책:** 장기적으로는 백엔드에서 인증 토큰을 **`HttpOnly`, `Secure`, `SameSite`** 속성이 적용된 쿠키에 담아 전달하는 방식으로 전환을 권장합니다.

---

## 🏗️ 3. 아키텍처 및 상태 관리 한계 (Architecture & Scalability Bottlenecks)

> [!IMPORTANT]
> 단일 프로세스/스레드 기반의 인메모리 상태 관리가 포함되어 있어, 서버 스케일 아웃(다중 컨테이너 구동)이나 트래픽 급증 시 심각한 장애가 발생할 수 있습니다.

```mermaid
graph TD
    subgraph 현재 아키텍처 (단일 인스턴스 종속 및 메모리 누수 위험)
        Client[사용자 브라우저] -->|SSE 스트리밍| FastAPI[FastAPI 인스턴스]
        FastAPI -->|Thread.start| Worker[로컬 스레드 분석 작업]
        FastAPI -->|전역 딕셔너리 적재| Cache[(engine_cache: 메모리 OOM 위험)]
    end
    subgraph 프로덕션 권장 아키텍처 (스케일 아웃 및 안정성 보장)
        Client2[사용자 브라우저] -->|API / SSE| LB[Nginx / Load Balancer]
        LB --> API1[FastAPI Worker 1] & API2[FastAPI Worker 2]
        API1 & API2 <--> Redis[(Redis: 분산 세션/캐시)]
        API1 & API2 -->|Task Queue| Celery[Celery / Async Task Workers]
    end
```

### 3.1. 전역 인메모리 캐시(`engine_cache = {}`)의 치명적 한계
* **현황:** `backend/main.py`에 전역 딕셔너리 `engine_cache = {}`를 두고, 수십~수백 MB의 파일 데이터와 네트워크 그래프를 품고 있는 `ChatFolioEngine` 인스턴스를 통째로 캐싱하고 있습니다.
* **문제점:**
  1. **메모리 누수 (OOM):** 세션이 종료되어도 캐시를 비우는 TTL(만료) 정책이 없어, 분석이 누적될수록 서버 메모리가 고갈되어 서버가 다운됩니다.
  2. **분산 환경 호환 불가:** 서버가 여러 대(스케일 아웃)로 늘어나거나 Gunicorn/Uvicorn 다중 워커로 실행될 경우, 요청이 다른 워커로 라우팅되면 `engine_cache`에 세션 정보가 없어 대화가 불가능해집니다.
* **개선책:** `Redis`를 활용하여 세션별 메타데이터와 파일 상태를 외부 분산 저장소에 직렬화하여 저장하고, 필요 시 엔진을 동적으로 재구성하는 구조로 개편해야 합니다.

### 3.2. 스레드(`Thread`) 기반 비동기 작업 처리 구조
* **현황:** `backend/main.py`의 `/analyze` 엔드포인트에서 무거운 깃허브 클론 및 파싱 작업을 `Thread(target=run_analysis).start()`로 실행하고 파이썬 `Queue`로 SSE 스트리밍을 구현합니다.
* **문제점:** 스레드 풀 관리가 되지 않아 동시에 많은 사용자가 분석을 요청하면 스레드가 폭증하여 CPU/메모리 스래싱이 발생합니다. 또한 서버 재시작 시 진행 중이던 모든 분석 작업이 유실됩니다.
* **개선책:** **Celery** 또는 **RQ (Redis Queue)** 와 같은 전문 비동기 작업 큐 시스템을 도입하고, 작업 상태를 DB나 Redis에 기록하여 안정적인 비동기 파이프라인을 구축해야 합니다.

### 3.3. 로컬 파일 시스템 의존성 (`Chroma` 및 모델 로딩)
* **현황:** `backend/core/rag/engine.py`에서 벡터 저장소 경로로 상대 경로(`persist_dir = f"storage/vectors/{id}"`)를 사용하며, HuggingFace Reranker 모델을 실행 시점에 로컬 파일시스템으로 다운로드합니다.
* **문제점:** 컨테이너 환경(Docker) 배포 시 볼륨 마운트가 견고하지 않으면 재배포 시마다 인덱스와 모델이 소실되거나 초기 기동 시간이 지연됩니다.
* **개선책:** `Chroma` 스토리지를 명확한 도커 볼륨(`/app/storage`) 또는 외부 클라우드 벡터 DB(Pinecone, Qdrant)로 이전하고, 모델 가중치는 도커 이미지 빌드 단계(`Dockerfile`)에서 미리 다운로드받아 번들링해야 합니다.

---

## 🐳 4. DevOps 및 인프라 설정 (DevOps & Infrastructure)

> [!NOTE]
> 프론트엔드와 백엔드를 연동하고 트래픽을 효율적으로 라우팅하기 위한 Nginx 리버스 프록시 설정이 필요합니다.

### 4.1. Nginx 리버스 프록시 설정 부재
`frontend/nginx.conf`를 보면 단일 페이지 애플리케이션(SPA)을 위한 HTML 서빙 라우팅(`try_files`)만 존재합니다.

```nginx
# 현재 frontend/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**💡 개선 방향:**
외부에서 프론트엔드 포트(80 또는 443)로 접속했을 때, `/api` 또는 `/auth`로 시작하는 요청을 백엔드 컨테이너(`http://backend:8000`)로 넘겨주는 **리버스 프록시 설정**을 추가해야 합니다. 이를 통해 CORS 이슈를 원천 차단하고 단일 도메인으로 서비스를 제공할 수 있습니다.

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 리버스 프록시 설정
    location /api/ {
        proxy_pass http://backend:8000/; # 백엔드 컨테이너로 전달
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # SSE (Server-Sent Events) 스트리밍을 위한 필수 헤더
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

---

## 💡 5. 코드 품질 및 리팩토링 제안 (Refactoring & Clean Code)

### 5.1. 예외 묵살(`except: pass`) 및 로깅 부재
* `backend/main.py` 140번 줄 등에 예외를 조용히 넘기는 `except: pass` 코드가 존재하여, 디버깅 및 에러 추적이 불가능합니다.
* 에러 발생 시 `print()`나 `traceback.print_exc()` 대신 **Python 표준 `logging` 모듈**을 도입하여 파일 로그 적재 및 포맷팅(시간, 레벨, 파일명)을 표준화해야 합니다.

### 5.2. 중복 코드 제거
* `backend/api/auth.py` 358~359번 줄에 동일한 `return await process_sso_login(...)` 구문이 중복 작성되어 있습니다. 불필요한 중복 코드를 정리합니다.

---

## 📋 6. 단계별 조치 체크리스트 (Action Plan)

안정적인 프로덕션 배포를 위해 다음 순서로 리팩토링을 진행하는 것을 권장합니다.

- [ ] **Phase 1: 엔드포인트 통합 및 환경 변수 분리 (가장 시급함)**
  * [ ] 프론트엔드 개별 컴포넌트의 `http://localhost:8000` 직접 `fetch` 호출을 `api/index.js`로 전면 대체
  * [ ] 백엔드 `auth.py`의 `redirect_uri` 및 `frontend_url`을 환경 변수 기반으로 수정
  * [ ] `.env.sample` 및 `.env` 파일에 프로덕션 필수 키 목록(`VITE_API_BASE_URL`, `FRONTEND_URL`, `GITHUB_REDIRECT_URI`) 명시

- [ ] **Phase 2: 보안 강화 및 Nginx 라우팅 구축**
  * [ ] `main.py` CORS 미들웨어의 `allow_origins`를 화이트리스트 구조로 수정
  * [ ] 시크릿 키 누락 시 기동 중단(Fail-fast) 로직 추가
  * [ ] `frontend/nginx.conf`에 `/api/` 리버스 프록시 및 SSE 스트리밍 버퍼링 해제 옵션 추가

- [ ] **Phase 3: 아키텍처 및 상태 관리 고도화**
  * [ ] `engine_cache` 메모리 캐시 구조에 최소한의 LRU 캐싱 또는 TTL(만료 시간) 적용
  * [ ] 무거운 분석 로직의 비동기 큐(Celery/RQ) 마이그레이션 검토
  * [ ] 도커 파일 수정하여 빌드 시점에 필수 HuggingFace 모델 가중치 사전 캐싱
