from typing import Annotated, TypedDict, List, Dict, Any, Union
from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq import ChatGroq
import json
import traceback
import os
import logging

logger = logging.getLogger(__name__)


class ReadmeState(TypedDict, total=False):
    project_context: str
    user_inputs: Dict[str, Any]
    archetype: str  # BE, FE, ML, Library 등
    analysis_report: str
    draft: str
    feedback: str
    iteration_count: int
    decision: str
    final_readme: str
    provider: str
    model_name: str
    languages: List[str]
    usage: Dict[str, int]  # { model_name: count }

class ReadmeAgent:
    def __init__(self, llm, provider="groq", model_name=None):
        self.llm = llm
        self.provider = provider
        self.model_name = model_name
        self.workflow = self._create_workflow()

    def _create_workflow(self):
        workflow = StateGraph(ReadmeState)

        # 1. Analyzer Node
        workflow.add_node("analyzer", self.analyzer_node)
        # 2. Router Node
        workflow.add_node("router", self.router_node)
        # 3. Draft Writer Node
        workflow.add_node("writer", self.writer_node)
        # 4. Reviewer Node
        workflow.add_node("reviewer", self.reviewer_node)

        # 엣지 연결
        workflow.set_entry_point("analyzer")
        workflow.add_edge("analyzer", "router")
        workflow.add_edge("router", "writer")
        workflow.add_edge("writer", "reviewer")

        # 조건부 엣지 (Reviewer -> Writer or END)
        workflow.add_conditional_edges(
            "reviewer",
            self.should_continue,
            {
                "revise": "writer",
                "approve": END
            }
        )

        return workflow.compile()

    def _safe_invoke(self, messages: List[Union[SystemMessage, HumanMessage]]):
        """에러 발생 시 폴백 모델을 시도하는 안전한 호출 메서드"""
        try:
            return self.llm.invoke(messages)
        except Exception as e:
            err_msg = str(e)
            print(f"⚠️ Primary LLM failed: {err_msg[:200]}...")
            
            # Fallback strategy
            fallback_models = []
            if self.provider == "groq":
                # 최신 Groq 모델 명칭 반영
                fallback_models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant"]
            elif self.provider == "openai":
                fallback_models = ["gpt-4o-mini", "gpt-3.5-turbo"]
            
            for f_model in fallback_models:
                if f_model == self.model_name: continue
                try:
                    print(f"🔄 Trying fallback model: {f_model}")
                    alt_llm = ChatGroq(model=f_model, temperature=0)
                    return alt_llm.invoke(messages)
                except Exception as ex:
                    print(f"❌ Fallback {f_model} failed: {str(ex)[:100]}")
                    continue
                    
            raise e

    def _get_cheap_llm(self):
        """단순 분석 작업을 위한 저비용 모델 반환"""
        if self.provider == "groq":
            return ChatGroq(model="llama-3.1-8b-instant", temperature=0)
        return self.llm

    def analyzer_node(self, state: ReadmeState) -> Dict[str, Any]:
        """Classify project archetype based on structure scan (Uses lightweight model)"""
        print("🔍 [Analyzer] Starting analysis...")
        cheap_llm = self._get_cheap_llm()
        try:
            system_prompt = "You are a project analysis expert. Analyze the given project context to classify the core archetype and write a summary report in JSON."
            user_prompt = f"""
            [Context]
            {state['project_context']}

            Analyze the project above and respond in the following format:
            {{
              "archetype": "Pick one: Backend, Frontend, Fullstack, Library, Script, etc.",
              "summary": "Summary of the project purpose and core features"
            }}
            """
            
            response = cheap_llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ])
            
            content = self._extract_json(response.content)
            res = json.loads(content)
            
            usage_info = response.response_metadata.get("token_usage", {})
            model = getattr(cheap_llm, "model_name", getattr(cheap_llm, "model", "unknown"))
            current_usage = state.get("usage", {})
            current_usage[model] = current_usage.get(model, 0) + usage_info.get("total_tokens", 0)

            return {
                "archetype": res.get("archetype", "General"),
                "analysis_report": res.get("summary", "분석 완료"),
                "iteration_count": 0,
                "usage": current_usage
            }
        except Exception as e:
            logger.exception("❌ [Analyzer] 오류 발생")
            return {"archetype": "General", "analysis_report": "분석 중 오류 발생", "iteration_count": 0}

    def router_node(self, state: ReadmeState) -> Dict[str, Any]:
        """분석 결과에 따른 프롬프트 전략 수립"""
        print(f"🔀 [Router] 분기 처리 중... ({state.get('archetype', 'Unknown')})")
        return {"iteration_count": state.get("iteration_count", 0)}

    def writer_node(self, state: ReadmeState) -> Dict[str, Any]:
        """Write draft README markdown"""
        curr_iter = state.get("iteration_count", 0)
        print(f"✍️ [Writer] Writing draft... (Iteration: {curr_iter})")
        
        try:
            # Context Truncation to stay within Ratelimits
            truncated_context = state.get('project_context', '')
            if len(truncated_context) > 12000: # 조금 더 보수적으로 12k로 제한
                truncated_context = truncated_context[:12000] + "\n... (Long context truncated for stability)"
            
            feedback_context = f"\n[Reviewer Feedback]: {state.get('feedback', '')}" if state.get('feedback') else ""
            
            system_prompt = "You are a technical writing expert. Based on the analysis report, actual source code context, and user information, write an outstanding README.md that conveys the true value of the project."
            user_prompt = f"""
            [Archetype]: {state.get('archetype', 'General')}
            [Analysis Report]: {state.get('analysis_report', '')}
            [Project Context (Source Code)]:
            {truncated_context}

            [User Inputs]: {json.dumps(state.get('user_inputs', {}), ensure_ascii=False)}
            {feedback_context}
            
            Guidelines:
            1. **Prioritize Inference**: For items users did not explicitly enter (project name, description, tech stack, starting, etc.), be sure to analyze the actual code in [Project Context] and fill them in yourself. Never use phrases like "Not entered."
            2. **Structure**: Must include Title, One-line introduction, Problem solved (based on analysis report), Core features (based on code), Tech stack (including badges), Folder structure (tree format), and Getting Started (Installation).
            3. **Detail**: Increase credibility by mentioning actual filenames and tech stacks.
            4. **Feedback Reflection**: If there is feedback, reflect it with high priority.
            5. **Language**: You must write the README in {', '.join(state.get('languages', ['English']))}. If multiple languages are specified, provide translated sections or separate sections for each language.
            6. **Output**: Output only the README.md markdown text. Omit all greetings or directives like "Yes, I will write."
            """
            
            response = self._safe_invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ])
            usage_info = response.response_metadata.get("token_usage", {})
            model = self.model_name or getattr(self.llm, "model_name", getattr(self.llm, "model", "unknown"))
            current_usage = state.get("usage", {})
            current_usage[model] = current_usage.get(model, 0) + usage_info.get("total_tokens", 0)

            return {"draft": response.content, "iteration_count": curr_iter + 1, "usage": current_usage}
        except Exception as e:
            logger.exception("❌ [Writer] 오류 발생")
            
            # Fallback README Generation (Simple)
            fallback_readme = f"# {state.get('archetype', 'Project')} README\n\nAI가 분석 중 오류가 발생하여 기본 정보를 출력합니다.\n\n## 분석 요약\n{state.get('analysis_report', '분석 정보가 없습니다.')}\n\n## 기술 스택\n{state.get('archetype', 'General')}"
            return {"draft": fallback_readme, "iteration_count": curr_iter + 1}

    def reviewer_node(self, state: ReadmeState) -> Dict[str, Any]:
        """Review draft and decide whether to approve"""
        print("🕵️ [Reviewer] Reviewing...")
        try:
            system_prompt = "You are a strict reviewer agent. Review the draft README and respond with approval and feedback in JSON."
            user_prompt = f"""
            [README Draft]
            {state.get('draft', '')}
            
            Checklist:
            1. Is Getting Started accurate?
            2. Are tech stack badges and folder structure included?
            3. Is the core value of the project well-explained?
            
            [Output Format - Output JSON only]
            {{
              "decision": "REVISE or APPROVE",
              "feedback": "Specific feedback for improvement (leave blank if APPROVE)"
            }}
            """
            response = self._safe_invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ])
            
            content = self._extract_json(response.content)
            res = json.loads(content)
            decision = res.get("decision", "REVISE")
            
            usage_info = response.response_metadata.get("token_usage", {})
            model = self.model_name or getattr(self.llm, "model_name", getattr(self.llm, "model", "unknown"))
            current_usage = state.get("usage", {})
            current_usage[model] = current_usage.get(model, 0) + usage_info.get("total_tokens", 0)

            return {
                "final_readme": state.get('draft', '') if decision == "APPROVE" else "",
                "feedback": res.get("feedback", ""),
                "decision": decision,
                "usage": current_usage
            }
        except Exception as e:
            logger.exception("❌ [Reviewer] 오류 발생")
            return {"decision": "APPROVE", "final_readme": state.get('draft', '')}

    def should_continue(self, state: ReadmeState):
        """조건부 엣지 로직"""
        if state.get("decision") == "APPROVE" or state.get("iteration_count", 0) >= 3:
            return "approve"
        return "revise"

    def _extract_json(self, text: str) -> str:
        if "```json" in text:
            return text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            return text.split("```")[1].split("```")[0].strip()
        return text.strip()

    def run(self, project_context: str, user_inputs: dict, languages: List[str] = ["English"]) -> str:
        initial_state = {
            "project_context": project_context,
            "user_inputs": user_inputs,
            "iteration_count": 0,
            "provider": self.provider,
            "model_name": self.model_name,
            "languages": languages
        }
        try:
            result = self.workflow.invoke(initial_state)
            return {
                "readme_content": result.get("final_readme") or result.get("draft") or "Failed to generate README",
                "usage": result.get("usage", {})
            }
        except Exception as e:
            logger.exception("❌ [ReadmeAgent.run] Critical error")
            return f"An error occurred while running the agent: {str(e)}"
