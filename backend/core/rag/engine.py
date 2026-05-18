from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from .readme_agent import ReadmeAgent
from .shared import get_embeddings, get_reranker
import json
import networkx as nx
import os
import shutil
import re
import logging

logger = logging.getLogger(__name__)

_MODEL_CONTEXT_CHARS = {
    "llama-3.3-70b-versatile": 16000,
    "llama-3.1-70b-versatile": 14000,
    "llama-3.1-8b-instant": 10000,
    "mixtral-8x7b-32768": 20000,
    "gemma2-9b-it": 12000,
}
_DEFAULT_CONTEXT_CHARS = 12000
_RRF_K = 60


class ChatFolioEngine:
    def __init__(self, files_data, graph, project_id=None, tech_stack=None,
                 provider="groq", model_name=None, force_reload=False,
                 files_metadata: dict = None):
        self.files_data = files_data
        self.graph = graph
        self.project_id = project_id
        self.tech_stack = tech_stack
        self.provider = provider
        self.model_name = model_name
        self.force_reload = force_reload
        # {path: {"importance_score": float, ...}} — pre-computed PageRank per file
        self.files_metadata = files_metadata or {}

        if provider == "huggingface":
            repo_id = model_name or "Qwen/Qwen2.5-Coder-7B-Instruct"
            if "qwen2.5-7b" in repo_id.lower() or "qwen3.6" in repo_id.lower() or "mistral" in repo_id.lower():
                repo_id = "Qwen/Qwen2.5-Coder-7B-Instruct"
            elif "qwen2.5-32b" in repo_id.lower():
                repo_id = "Qwen/Qwen2.5-Coder-32B-Instruct"
            hf_llm = HuggingFaceEndpoint(
                repo_id=repo_id,
                max_new_tokens=512,
                temperature=0.1,
                huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN"),
            )
            self.llm = ChatHuggingFace(llm=hf_llm)
        else:
            self.llm = ChatGroq(model=model_name or "llama-3.3-70b-versatile", temperature=0)

        self.verifier_llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)

        # Singleton models — loaded once per server process, not per session
        self.embeddings = get_embeddings()
        self.reranker = get_reranker()

        self.vector_db = self._prepare_vector_db()
        self.bm25_retriever = self._prepare_bm25_retriever()

    # ──────────────────────────────────────────
    # CHUNKING
    # ──────────────────────────────────────────

    def _chunk_file(self, path: str, content: str) -> list:
        """AST 메타데이터가 있으면 그것을 사용하고, 없으면 텍스트 스플리터로 fallback."""
        meta = self.files_metadata.get(path, {})
        ast_chunks = meta.get("chunks") if meta else None

        if ast_chunks:
            return [
                {
                    "page_content": c.get("code", ""),
                    "metadata": {
                        "path": path,
                        "start_line": c.get("start_line", "?"),
                        "end_line": c.get("end_line", "?"),
                    },
                }
                for c in ast_chunks
                if c.get("code", "").strip()
            ]

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1200,
            chunk_overlap=100,
            separators=["\nclass ", "\ndef ", "\nfn ", "\nfun ", "\nfunc ",
                        "\ninterface ", "\nmodule ", "\n\n", "\n"],
        )
        chunks = splitter.split_text(content)
        result = []
        pos = 0
        for chunk in chunks:
            idx = content.find(chunk.strip(), pos)
            if idx == -1:
                idx = content.find(chunk.strip())
            if idx != -1:
                start_line = content.count("\n", 0, idx) + 1
                end_line = start_line + chunk.count("\n")
                pos = idx + len(chunk)
            else:
                start_line = end_line = "?"
            result.append({
                "page_content": chunk,
                "metadata": {"path": path, "start_line": start_line, "end_line": end_line},
            })
        return result

    # ──────────────────────────────────────────
    # VECTOR DB
    # ──────────────────────────────────────────

    def _prepare_vector_db(self):
        persist_dir = f"storage/vectors/{self.project_id}" if self.project_id else None

        if not self.force_reload and persist_dir and os.path.exists(persist_dir) and os.listdir(persist_dir):
            logger.info("[Chroma] Loading existing vector DB from %s", persist_dir)
            try:
                return Chroma(persist_directory=persist_dir, embedding_function=self.embeddings)
            except Exception as e:
                logger.warning("[Chroma] Failed to load existing DB: %s. Recreating...", e)

        if persist_dir and os.path.exists(persist_dir):
            shutil.rmtree(persist_dir, ignore_errors=True)
        if persist_dir:
            os.makedirs(persist_dir, exist_ok=True)

        logger.info("[Chroma] Creating new vector DB...")
        docs_raw = []
        items = self.files_data.items() if isinstance(self.files_data, dict) else self.files_data
        for path, content in items:
            if content and len(content.strip()) >= 10:
                docs_raw.extend(self._chunk_file(path, content))

        if not docs_raw:
            return Chroma.from_texts(
                [" "], self.embeddings,
                metadatas=[{"path": "none"}],
                persist_directory=persist_dir,
            )

        texts = [d["page_content"] for d in docs_raw]
        metadatas = [d["metadata"] for d in docs_raw]
        try:
            vdb = Chroma.from_texts(
                texts=texts, embedding=self.embeddings,
                metadatas=metadatas, persist_directory=persist_dir,
            )
            logger.info("[Chroma] Created with %d chunks.", len(texts))
            return vdb
        except Exception as e:
            logger.error("[Chroma] Creation failed: %s", e)
            return Chroma.from_texts(texts, self.embeddings, metadatas=metadatas)

    # ──────────────────────────────────────────
    # BM25 — lightweight: 1 doc per file
    # ──────────────────────────────────────────

    def _prepare_bm25_retriever(self):
        """파일당 1 문서 (기호명 + 첫 3000자) — 메모리 절약."""
        logger.info("[BM25] Building lightweight keyword index...")
        docs = []
        items = self.files_data.items() if isinstance(self.files_data, dict) else self.files_data
        for path, content in items:
            if not content or len(content.strip()) < 10:
                continue
            symbols = " ".join(re.findall(r"(?:class|def|fn|func|function|interface)\s+(\w+)", content))
            body = content[:3000]
            doc_text = f"{symbols}\n{body}" if symbols else body
            docs.append(Document(page_content=doc_text, metadata={"path": path}))

        if not docs:
            docs = [Document(page_content=" ", metadata={"path": "none"})]
        return BM25Retriever.from_documents(docs)

    # ──────────────────────────────────────────
    # HYBRID SEARCH — Reciprocal Rank Fusion
    # ──────────────────────────────────────────

    @staticmethod
    def _rrf(ranked_lists: list, k: int = _RRF_K) -> list:
        scores: dict = {}
        doc_map: dict = {}
        for ranked in ranked_lists:
            for rank, doc in enumerate(ranked):
                doc_id = f"{doc.metadata.get('path')}:{doc.page_content[:80]}"
                scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
                doc_map[doc_id] = doc
        return [doc_map[i] for i in sorted(scores, key=lambda x: scores[x], reverse=True)]

    def _hybrid_search(self, query: str, base_k: int) -> list:
        vector_results = self.vector_db.similarity_search(query, k=base_k * 2)
        bm25_results = self.bm25_retriever.invoke(query)[:base_k]
        return self._rrf([vector_results, bm25_results])

    # ──────────────────────────────────────────
    # RERANKER — graph-boosted (CE 75% + graph 25%)
    # ──────────────────────────────────────────

    def _rerank(self, query: str, docs: list, top_n: int) -> list:
        if not docs:
            return []
        if len(docs) <= top_n:
            return docs
        try:
            pairs = [[query, doc.page_content] for doc in docs]
            ce_scores = self.reranker.predict(pairs)

            min_ce, max_ce = float(min(ce_scores)), float(max(ce_scores))
            span = max_ce - min_ce if max_ce != min_ce else 1.0
            norm_ce = [(float(s) - min_ce) / span for s in ce_scores]

            def _graph_score(path: str) -> float:
                meta = self.files_metadata.get(path, {})
                if meta and meta.get("importance_score") is not None:
                    return float(meta["importance_score"])
                if path in self.graph:
                    n = self.graph.number_of_nodes()
                    return self.graph.in_degree(path) / max(n, 1)
                return 0.0

            raw_g = [_graph_score(doc.metadata.get("path", "")) for doc in docs]
            max_g = max(raw_g) if max(raw_g) > 0 else 1.0
            norm_g = [v / max_g for v in raw_g]

            combined = [0.75 * ce + 0.25 * g for ce, g in zip(norm_ce, norm_g)]
            return [doc for _, doc in
                    sorted(zip(combined, docs), key=lambda x: x[0], reverse=True)[:top_n]]
        except Exception as e:
            logger.warning("[Rerank] Failed: %s", e)
            return docs[:top_n]

    # ──────────────────────────────────────────
    # CONTEXT BUDGET
    # ──────────────────────────────────────────

    def _context_budget(self) -> int:
        return _MODEL_CONTEXT_CHARS.get(self.model_name or "", _DEFAULT_CONTEXT_CHARS)

    # ──────────────────────────────────────────
    # HISTORY COMPRESSION
    # ──────────────────────────────────────────

    def _compress_history(self, history: list) -> list:
        """20개 초과 시 오래된 메시지를 요약 후 최근 10개만 유지."""
        if not history or len(history) <= 20:
            return history or []
        old = history[:-10]
        recent = history[-10:]
        old_text = "\n".join(f"{m['role']}: {m['content'][:300]}" for m in old)
        try:
            summary = self.verifier_llm.invoke([
                SystemMessage(content="Summarize this conversation concisely in 3-5 bullet points. Preserve key technical facts."),
                HumanMessage(content=old_text),
            ])
            compressed = [{"role": "assistant",
                           "content": f"[Earlier conversation summary]\n{summary.content}"}]
        except Exception:
            compressed = [{"role": "assistant",
                           "content": "[Earlier conversation omitted for context limit]"}]
        return compressed + recent

    # ──────────────────────────────────────────
    # SHARED RETRIEVAL CORE
    # ──────────────────────────────────────────

    def _retrieve_context(self, query: str):
        """Returns (final_docs, sources, visited_nodes, neighbor_paths)."""
        file_count = len(self.files_data)
        base_k = 20 if file_count < 50 else (15 if file_count < 200 else 12)

        candidates = self._hybrid_search(query, base_k)[:20]
        final_docs = self._rerank(query, candidates, top_n=8)

        sources, visited_nodes, neighbor_paths = [], [], []
        seen_paths: set = set()

        for doc in final_docs:
            path = doc.metadata.get("path", "unknown")
            start_line = doc.metadata.get("start_line", "?")
            end_line = doc.metadata.get("end_line", "?")

            if path not in seen_paths:
                seen_paths.add(path)
                sources.append({"path": path, "reason": "AI Ranked Context",
                                 "lines": f"L{start_line}-L{end_line}"})
                if path in self.graph:
                    neighbors = sorted(
                        self.graph.neighbors(path),
                        key=lambda x: self.graph.in_degree(x) if x in self.graph else 0,
                        reverse=True,
                    )
                    for n in neighbors[:3]:
                        if n not in seen_paths:
                            neighbor_paths.append(n)
                            sources.append({"path": n,
                                            "reason": f"Dependency (from {path.split('/')[-1]})"})
                        visited_nodes.append({"from": path, "to": n})

        return final_docs, sources, visited_nodes, neighbor_paths

    def _build_context_text(self, final_docs: list, neighbor_paths: list) -> str:
        budget = self._context_budget()
        usage = 0
        context_text = ""

        readme_chunks, code_chunks = [], []
        for doc in final_docs:
            filename = os.path.basename(doc.metadata.get("path", "")).lower()
            if filename == "readme.md":
                if len(readme_chunks) < 2:
                    readme_chunks.append(doc)
            else:
                code_chunks.append(
                    Document(page_content=self._clean_code_snippet(doc.page_content),
                             metadata=doc.metadata)
                )

        if code_chunks:
            context_text += "\n### [SECTION: TECHNICAL IMPLEMENTATION (Source Code)]\n"
            for doc in code_chunks:
                if usage >= budget:
                    break
                snippet = (f"--- File Chunk: {doc.metadata['path']} "
                           f"(Lines {doc.metadata.get('start_line','?')}-"
                           f"{doc.metadata.get('end_line','?')}) ---\n"
                           f"{doc.page_content}\n")
                context_text += snippet
                usage += len(snippet)

        if readme_chunks and usage < budget:
            context_text += "\n### [SECTION: PROJECT OVERVIEW (Documentation)]\n"
            for doc in readme_chunks:
                if usage >= budget:
                    break
                snippet = f"- Source: {doc.metadata['path']}\n{doc.page_content}\n\n"
                context_text += snippet
                usage += len(snippet)

        if neighbor_paths and usage < budget:
            context_text += "\n### [SECTION: RELATED CONTEXT (Dependencies)]\n"
            for path in neighbor_paths:
                if usage >= budget:
                    break
                if path in self.files_data:
                    content = self._clean_code_snippet(self.files_data[path][:500])
                    snippet = f"\n--- File (Partial): {path} ---\n{content}\n"
                    context_text += snippet
                    usage += len(snippet)

        return context_text

    def _build_system_prompt(self, language: str) -> str:
        all_paths = list(self.files_data.keys())
        priority = [p for p in all_paths if any(x in p.lower()
                    for x in ["src", "app", "core", "lib", "main", "api", "pkg", "cmd", "scripts"])]
        other = [p for p in all_paths if p not in priority]
        files_list = "\n".join(f"- {p}" for p in (priority + other)[:500])

        tech_context = ""
        if self.tech_stack:
            tech_context = (
                f"\n[Project Tech Stack]\n"
                f"- Main Language: {self.tech_stack.get('main_language')}\n"
                f"- Frameworks: {', '.join(self.tech_stack.get('frameworks', []))}\n"
            )

        return f"""You are an elite Software Architect and Code Auditor.
Your goal is to provide 100% technically accurate analysis based ONLY on the provided source code.

[PROJECT BRAIN MAP (Full File Tree)]
{files_list}

[STRICT OPERATIONAL RULES - READ CAREFULLY]
1. **NO HALLUCINATION**: Never invent file names, directory structures, or logic not in 'TECHNICAL IMPLEMENTATION'.
2. **STRICT CONTEXTUALITY**: If the answer is not in the provided code snippets, state: "I cannot find the specific implementation of X in the provided context."
3. **FILE PATH VERIFICATION**: Cross-reference every file path with [PROJECT BRAIN MAP] and '--- File Chunk: path ---' headers.
4. **CRITICAL THINKING**: Analyze the code's intent. Explain logic and potential edge cases.
5. **DOMAIN ADAPTATION**: Adapt your tone to the project's archetype.

[STRICT FORMATTING RULES]
- **Language**: You MUST answer in {language}.
- **Structure**: Use Markdown headers (###), bullet points (-), and bold text (**bold**).
- **Spacing**: Use double newlines (\\n\\n) between sections.

[MANDATORY ANALYSIS SUMMARY]
At the end of your response, provide:
### 🔍 Analysis Summary
- **Keywords**: [3-5 core technical keywords]
- **Reference Files**: [List exact file paths and line ranges used]
- **AI Confidence**: [0-100%]
- **Trust Level**: [Low / Medium / High]
{tech_context}"""

    # ──────────────────────────────────────────
    # PUBLIC API
    # ──────────────────────────────────────────

    def ask(self, query: str, history: list = None, language: str = "English"):
        history = self._compress_history(history)
        final_docs, sources, visited_nodes, neighbor_paths = self._retrieve_context(query)
        context_text = self._build_context_text(final_docs, neighbor_paths)

        messages = [SystemMessage(content=self._build_system_prompt(language))]
        for msg in history:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                messages.append(AIMessage(content=msg.get("content", "")))
        messages.append(HumanMessage(
            content=f"### [SECTION: TECHNICAL IMPLEMENTATION]\n{context_text}\n\n### [USER QUESTION]\n{query}"
        ))

        response = self.llm.invoke(messages)
        final_answer = response.content

        if self.provider == "huggingface":
            verified = self.verifier_llm.invoke([
                SystemMessage(content="You are a Technical Verifier."),
                HumanMessage(content=f"Review and polish this technical answer in {language} for accuracy.\n\nAnswer: {final_answer}"),
            ])
            final_answer = verified.content

        evaluation = self._evaluate_answer(query, final_answer, context_text)
        return {
            "answer": final_answer,
            "sources": sources,
            "evaluation": evaluation,
            "graph_trace": visited_nodes,
            "usage": response.response_metadata.get("token_usage", {}),
        }

    def ask_stream(self, query: str, history: list = None, language: str = "English"):
        """SSE 스트리밍 질의응답."""
        history = self._compress_history(history)
        final_docs, sources, visited_nodes, neighbor_paths = self._retrieve_context(query)
        context_text = self._build_context_text(final_docs, neighbor_paths)

        messages = [SystemMessage(content=self._build_system_prompt(language))]
        for msg in history:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                messages.append(AIMessage(content=msg.get("content", "")))
        messages.append(HumanMessage(
            content=f"### [SECTION: TECHNICAL IMPLEMENTATION]\n{context_text}\n\n### [USER QUESTION]\n{query}"
        ))

        yield {"type": "meta", "sources": sources, "graph_trace": visited_nodes,
               "context_text": context_text}

        full_answer = ""
        for chunk in self.llm.stream(messages):
            token = chunk.content
            full_answer += token
            yield {"type": "token", "token": token}

        yield {"type": "done", "answer": full_answer}

    # ──────────────────────────────────────────
    # EVALUATION
    # ──────────────────────────────────────────

    def _evaluate_answer(self, query: str, answer: str, context: str) -> dict:
        eval_prompt = f"""You are a Technical Quality Auditor. Evaluate the 'Answer' based on the 'Context'.

[Query]
{query}

[Context]
{context}

[Answer]
{answer}

[Criteria]
1. **Faithfulness**: Is the answer derived ONLY from the context? (0-100)
2. **Technical Accuracy**: Are class/function names and logic correct? (0-100)
3. **File Path Integrity**: Are ALL mentioned file paths present in 'Context'? (If AI invented a path, score must be 0)

[Output Format - JSON only]
{{
    "score": average_score,
    "verdict": "High Trust" | "Medium Trust" | "Low Trust" | "CRITICAL HALLUCINATION",
    "reason": "자신감 있고 당당하며 전문적인 톤의 평가 요약 (한국어).",
    "checks": {{
        "faithfulness": 100,
        "accuracy": 100,
        "file_path_verified": true,
        "hallucination_detected": false
    }}
}}"""
        try:
            response = self.verifier_llm.invoke([
                SystemMessage(content="You are a strict technical evaluator. Output JSON only."),
                HumanMessage(content=eval_prompt),
            ])
            match = re.search(r"\{.*\}", response.content, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception as e:
            logger.warning("[Eval] Failed: %s", e)

        return {
            "score": 0,
            "verdict": "Evaluation Failed",
            "reason": "검증 도중 오류가 발생했습니다.",
            "checks": {"faithfulness": 0, "accuracy": 0, "hallucination_detected": True},
        }

    # ──────────────────────────────────────────
    # UTILITIES
    # ──────────────────────────────────────────

    def _clean_code_snippet(self, code: str) -> str:
        if not code:
            return ""
        code = re.sub(r"\n\s*\n", "\n\n", code)
        code = re.sub(r"/\*.*?\*/", "", code, flags=re.DOTALL)
        code = re.sub(r'"""(.*?)"""', '"""[Docstring trimmed]"""', code, flags=re.DOTALL)
        return code.strip()

    def _get_cheap_llm(self):
        if self.provider == "groq":
            return ChatGroq(model="llama-3.1-8b-instant", temperature=0)
        return self.llm

    # ──────────────────────────────────────────
    # ARCHITECTURE ANALYSIS
    # ──────────────────────────────────────────

    def analyze_architecture(self, language: str = "English"):
        node_count = self.graph.number_of_nodes()
        edge_count = self.graph.number_of_edges()
        try:
            centrality = nx.degree_centrality(self.graph)
            top_files = [n for n, _ in
                         sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:5]]
        except Exception:
            top_files = []

        important_snippets = "".join(
            f"\n- File: {p}\n```\n{self.files_data.get(p, '')[:1000]}\n```\n"
            for p in top_files if self.files_data.get(p)
        )

        system_prompt = (
            f"You are a Senior Software Architect. "
            f"Analyze the project to provide a professional architecture review in {language}. "
            "Use clear Markdown headers (###), bullet points (-), and dividers (---)."
        )
        user_prompt = (
            f"[Project Statistics]\n"
            f"- Total Files: {node_count}\n- Total Dependencies: {edge_count}\n"
            f"- Tech Stack: {json.dumps(self.tech_stack, ensure_ascii=False) if self.tech_stack else 'Unknown'}\n\n"
            f"[Important Files]:\n{', '.join(top_files)}\n\n"
            f"[Source Code Snippets]:\n{important_snippets}\n\n"
            f"Provide a detailed architecture analysis in {language} covering:\n"
            "1. **Overall Design Pattern**\n2. **Component Roles**\n"
            "3. **Data/Control Flow**\n4. **Architectural Evaluation**"
        )
        response = self.llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
        return {"analysis": response.content, "usage": response.response_metadata.get("token_usage", {})}

    # ──────────────────────────────────────────
    # PIPELINE GENERATION
    # ──────────────────────────────────────────

    def generate_pipeline(self, language: str = "English"):
        try:
            centrality = nx.degree_centrality(self.graph)
            top_files = [n for n, _ in
                         sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:10]]
        except Exception:
            top_files = list(self.files_data.keys())[:5]

        important_snippets = "".join(
            f"\n- File: {p}\n```\n{self.files_data.get(p, '')[:800]}\n```\n"
            for p in top_files if self.files_data.get(p)
        )

        system_prompt = (
            f"You are a Senior System Architect. Analyze source code to identify the core Execution Pipeline. "
            f"Respond in {language}.\n\n"
            '[Output Format - JSON only]\n'
            '{"steps": [{"id": "step_id", "title": "Short Step Title", "desc": "Brief description", '
            '"file": "main_file.ext", "tech": ["Tech1"], "color": "#HEX", '
            '"details": {"actions": ["Action"], "payload": {"key": "value"}}}]}\n\n'
            "[Rules]\n"
            "1. Identify 5-8 logical steps representing the core life cycle.\n"
            "2. Assign unique vibrant hex colors to each step.\n"
            "3. OUTPUT ONLY RAW JSON."
        )
        user_prompt = f"Tech Stack: {json.dumps(self.tech_stack)}\n\nImportant Files:\n{important_snippets}"

        try:
            response = self.llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
            match = re.search(r"\{.*\}", response.content, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception as e:
            logger.warning("[Pipeline] Generation failed: %s", e)
        return {"steps": []}

    # ──────────────────────────────────────────
    # TITLE SUMMARIZATION
    # ──────────────────────────────────────────

    def summarize_title(self, query: str) -> str:
        cheap_llm = self._get_cheap_llm()
        try:
            response = cheap_llm.invoke([
                SystemMessage(content="Create a very short title of about 3-5 words based on the user's question. Output only the title without quotes or periods."),
                HumanMessage(content=f"Question: {query}"),
            ])
            return {
                "title": response.content.strip().replace('"', "").replace("'", ""),
                "usage": response.response_metadata.get("token_usage", {}),
            }
        except Exception:
            return query[:20] + "..."

    # ──────────────────────────────────────────
    # MERMAID DIAGRAM
    # ──────────────────────────────────────────

    def generate_mermaid(self) -> str:
        cheap_llm = self._get_cheap_llm()
        nodes = list(self.graph.nodes())
        nodes_str = "\n".join(nodes)

        try:
            response = cheap_llm.invoke([
                SystemMessage(content="""You are a software architect. Group the file paths by domain, role, or technical layer.

[Output Format - JSON only]
```json
{"subgraphs": [{"name": "Component", "nodes": ["path/to/file.ext"]}]}
```"""),
                HumanMessage(content=f"Files:\n{nodes_str}"),
            ])
            content = response.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            grouping = json.loads(content)

            node_id_map = {node: f"Node_{i}" for i, node in enumerate(nodes)}
            lines = ["graph TD"]
            used_nodes: set = set()
            for sg in grouping.get("subgraphs", []):
                name = sg.get("name", "Unknown").replace(" ", "_").replace('"', "")
                lines.append(f"    subgraph {name}")
                for node in sg.get("nodes", []):
                    if node in node_id_map:
                        lines.append(f'        {node_id_map[node]}["{node.split("/")[-1]}"]')
                        used_nodes.add(node)
                lines.append("    end")
            for node in nodes:
                if node not in used_nodes:
                    lines.append(f'    {node_id_map[node]}["{node.split("/")[-1]}"]')
            for u, v in self.graph.edges():
                if u in node_id_map and v in node_id_map:
                    lines.append(f"    {node_id_map[u]} --> {node_id_map[v]}")
            return "\n".join(lines)
        except Exception as e:
            logger.warning("[Mermaid] Generation failed: %s", e)
            node_id_map = {node: f"N_{i}" for i, node in enumerate(nodes)}
            lines = ["graph TD"]
            for node, nid in node_id_map.items():
                lines.append(f'    {nid}["{node.split("/")[-1]}"]')
            for u, v in self.graph.edges():
                if u in node_id_map and v in node_id_map:
                    lines.append(f"    {node_id_map[u]} --> {node_id_map[v]}")
            return "\n".join(lines)

    # ──────────────────────────────────────────
    # README GENERATION
    # ──────────────────────────────────────────

    def generate_readme(self, user_inputs: dict = None, llm=None, provider=None,
                        model_name=None, languages=["English"]) -> str:
        target_llm = llm if llm else self.llm
        target_provider = provider if provider else self.provider
        target_model = model_name if model_name else self.model_name

        if not target_llm:
            return "# README\n\nLLM is not configured."

        nodes = list(self.graph.nodes())
        file_count = len(nodes)

        manifest_content = ""
        README_CONTEXT_BUDGET = 10000
        current_usage = 0
        manifest_priority = ["package.json", "build.gradle", "pom.xml", "requirements.txt",
                              "settings.gradle", "docker-compose.yml"]
        skip_files = ["package-lock.json", "yarn.lock", "gradle-wrapper.properties"]

        for path, content in self.files_data.items():
            if current_usage >= README_CONTEXT_BUDGET:
                break
            fname = os.path.basename(path).lower()
            if (any(m in fname for m in manifest_priority)
                    and not any(s in fname for s in skip_files)):
                snippet = f"\n--- {path} ---\n{content[:800]}\n"
                manifest_content += snippet
                current_usage += len(snippet)

        in_degrees = dict(self.graph.in_degree())
        top_files = sorted(in_degrees.items(), key=lambda x: x[1], reverse=True)[:5]
        top_files_str = "\n".join(f"- {f} (참조됨: {count}회)" for f, count in top_files)

        core_files_code = ""
        for f, _ in top_files:
            if current_usage >= README_CONTEXT_BUDGET:
                break
            if f in self.files_data:
                snippet = f"\n--- {f} ---\n{self.files_data[f][:1000]}...\n"
                core_files_code += snippet
                current_usage += len(snippet)

        dirs = {os.path.dirname(node) for node in nodes}
        dir_tree = "\n".join(f"- {d}/" for d in sorted(dirs)[:15])

        extensions: dict = {}
        framework_hints: set = set()
        for path in self.files_data.keys():
            ext = path.split(".")[-1].lower() if "." in path else ""
            if ext:
                extensions[ext] = extensions.get(ext, 0) + 1
            pl = path.lower()
            if "package.json" in pl: framework_hints.add("Node.js / NPM")
            if "build.gradle" in pl or "settings.gradle" in pl: framework_hints.add("Gradle (Android/Spring)")
            if "pom.xml" in pl: framework_hints.add("Maven (Java/Spring)")
            if "requirements.txt" in pl: framework_hints.add("Python Ecosystem")
            if "dockerfile" in pl or "docker-compose" in pl: framework_hints.add("Docker")
            if "tsconfig.json" in pl: framework_hints.add("TypeScript")

        top_exts_str = ", ".join(
            f".{ext}({cnt}개)"
            for ext, cnt in sorted(extensions.items(), key=lambda x: x[1], reverse=True)[:3]
        )
        framework_str = (", ".join(framework_hints)
                         if framework_hints else "Specific framework could not be inferred")

        user_input_context = ""
        if user_inputs and any(user_inputs.values()):
            user_input_context = "\n[👤 사용자 추가 정보]\n"
            for k, v in user_inputs.items():
                if v and str(v).strip():
                    user_input_context += f"- {k}: {v}\n"

        context = (
            f"\n[🤖 프로젝트 정체성 분석 결과]\n"
            f"- Main Language/Extension: {top_exts_str}\n"
            f"- Detected Env/Framework Hints: {framework_str}\n"
            f"{user_input_context}\n"
            f"\n[📂 프로젝트 구조 및 핵심 데이터]\n"
            f"1. 전체 파일 수: {file_count}개\n"
            f"2. 디렉토리 구조 (최상위 일부): {dir_tree}\n"
            f"3. 핵심 파일 (많이 참조된 파일): {top_files_str}\n"
            f"4. 주요 파일들의 실제 내용 (일부):\n{manifest_content}\n{core_files_code}\n"
        )

        agent = ReadmeAgent(target_llm, provider=target_provider, model_name=target_model)
        return agent.run(context, user_inputs or {}, languages=languages)
