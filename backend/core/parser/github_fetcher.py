import base64
import logging
import os
from github import Github, Auth

logger = logging.getLogger(__name__)

class GitHubFetcher:
    def __init__(self, token: str):
        auth = Auth.Token(token)
        self.g = Github(auth=auth)
        # 분석 대상 확장자 정의
        # 분석 대상 확장자 정의 (텍스트 기반의 소스코드, 설정, 문서)
        self.target_extensions = (
            '.kt', '.kts', '.java', '.py', '.js', '.ts', '.tsx', '.jsx', 
            '.cpp', '.h', '.c', '.go', '.rs', '.swift', '.svelte',
            '.json', '.yaml', '.yml', '.toml', '.xml', '.properties', '.gradle',
            '.sh', '.dockerfile', 'dockerfile'
        )

    def _is_valid_file(self, file_path: str) -> bool:
        """
        주어진 파일 경로가 코드 분석에 유효한 파일인지 검사합니다.
        True면 수집, False면 스킵합니다.
        """
        path_lower = file_path.lower()
        
        # 1. 절대 들어가면 안 되는 폴더명 (경로 중간에 포함되어 있는지 검사)
        blacklisted_dirs = {
            "/node_modules/", "/venv/", "/.venv/", "/env/", "/__pycache__/",
            "/vendor/", "/.gradle/", "/.m2/", 
            "/build/", "/dist/", "/out/", "/target/", "/bin/", "/obj/",
            "/.idea/", "/.vscode/", "/.history/", "/.next/", "/.nuxt/",
            "/coverage/", "/.pytest_cache/", "/ios/Pods/", "/.expo/",
            "/.svelte-kit/", "/.tox/"
        }
        
        # 깃허브 API에서 최상위 경로도 걸러내기 위해 맨 앞에 '/'를 붙여서 검사
        check_path = f"/{path_lower}"
        if any(b_dir in check_path for b_dir in blacklisted_dirs):
            return False
            
        # 2. 토큰을 잡아먹는 특정 파일명 차단
        blacklisted_files = {
            "package-lock.json", "yarn.lock", "pnpm-lock.yaml", 
            "poetry.lock", "gemfile.lock", ".ds_store", "thumbs.db",
            "id_rsa", "id_dsa", ".eslintcache", ".stylelintcache"
        }
        file_name = path_lower.split("/")[-1]
        if file_name in blacklisted_files:
            return False
            
        # 3. 분석에서 제외할 확장자 (바이너리, 미디어, 컴파일, 난독화)
        blacklisted_exts = (
            ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
            ".mp4", ".mp3", ".pdf", ".zip", ".tar.gz",
            ".class", ".jar", ".pyc", ".exe", ".dll", ".so", ".o",
            ".min.js", ".min.css", ".sqlite", ".db",
            ".pem", ".key", ".crt", ".keystore", ".log", ".bak", ".swp", ".tmp"
        )
        if path_lower.endswith(blacklisted_exts):
            return False

        return True

    def fetch_repo_files(self, repo_url: str, progress_callback=None):
        repo_path = repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
        repo = self.g.get_repo(repo_path)
        
        branch = repo.default_branch
        tree = repo.get_git_tree(branch, recursive=True)
        
        # 1. 확장자 화이트리스트 필터링 + 2. 디렉토리/파일명 블랙리스트 필터링
        all_blobs = [
            e for e in tree.tree 
            if e.type == "blob" and 
            (e.path.lower().endswith(self.target_extensions) or e.path.lower() == 'dockerfile') and
            self._is_valid_file(e.path)
        ]
        total_files = len(all_blobs)
        
        msg = f"📂 [{repo.full_name}] ({branch}) 스캔 중... (총 {total_files}개 파일)"
        logger.info(msg)
        if progress_callback: progress_callback(msg)

        # 최신 커밋 정보 가져오기
        latest_commit = repo.get_commits()[0]
        commit_info = {
            "hash": latest_commit.sha,
            "message": latest_commit.commit.message,
            "total_files": total_files
        }
        
        def file_generator():
            for i, element in enumerate(all_blobs):
                try:
                    blob = repo.get_git_blob(element.sha)
                    content = base64.b64decode(blob.content).decode('utf-8', errors='ignore')
                    
                    if progress_callback:
                        progress = int(((i + 1) / total_files) * 100)
                        progress_callback(f"PROGRESS:{progress}")
                        progress_callback(f"📄 Collection completed: {element.path}")
                    
                    yield element.path, content
                except Exception as e:
                    error_msg = f"   ❌ 읽기 실패: {element.path} ({e})"
                    logger.warning(error_msg)
                    if progress_callback:
                        progress_callback(error_msg)
        
        return commit_info, file_generator()


    def fetch_latest_commit(self, repo_url: str):
        """최신 커밋 해시와 메시지만 가져옴"""
        repo_path = repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
        repo = self.g.get_repo(repo_path)
        latest_commit = repo.get_commits()[0]
        return {
            "hash": latest_commit.sha,
            "message": latest_commit.commit.message
        }

    def fetch_commit_stats(self, repo_url: str):
        """커밋 시간대 분석을 위한 데이터 수집"""
        repo_path = repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
        repo = self.g.get_repo(repo_path)
        
        # 최근 100개 커밋의 시간대 추출
        commits = repo.get_commits()[:100]
        hours = []
        for commit in commits:
            # commit.commit.author.date는 UTC 기준
            # 한국 시간으로 보정하려면 +9시간
            # 여기서는 간단히 시간대만 추출
            hours.append(commit.commit.author.date.hour)
            
        return hours