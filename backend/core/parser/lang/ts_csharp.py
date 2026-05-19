from typing import Dict, Any
from ..tree_sitter_base import BaseTreeSitterParser

class CSharpParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": meta.get("file_path", ""),
            "language": "csharp",
            "usings": [],              # using System.Linq; 등
            "namespaces": [],          # namespace 정의
            "classes": [],             # 클래스 (상속, 메서드 포함)
            "interfaces": [],          # 인터페이스 선언
            "linq_query_count": 0,     # LINQ 문법 사용 횟수
            "is_unity_script": False   # Unity 환경 파일 여부 플래그
        }

        # 1. 최상위 구조 및 LINQ 식별을 위한 Tree-sitter Query
        query_source = """
        ;; Using 구문의 이름 영역 캡처
        (using_directive name: (_) @using_name)

        ;; 클래스, 인터페이스, 네임스페이스 선언부 캡처
        (namespace_declaration name: (_) @namespace_name)
        (class_declaration) @class_node
        (interface_declaration) @interface_node

        ;; LINQ 쿼리 표현식 (from ... select ...) 캡처
        (query_expression) @linq_expr
        """

        try:
            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            for node, capture_name in captures:
                node_text = node.text.decode('utf8', errors='ignore')

                # --- 1. Namespaces & Usings ---
                if capture_name == "using_name":
                    parsed_data["usings"].append(node_text)
                    if "UnityEngine" in node_text:
                        parsed_data["is_unity_script"] = True
                
                elif capture_name == "namespace_name":
                    parsed_data["namespaces"].append(node_text)

                # --- 2. Class & Inheritance ---
                elif capture_name == "class_node":
                    class_info = self._process_class_or_interface(node, node_type="class")
                    parsed_data["classes"].append(class_info)
                    
                    # MonoBehaviour 상속 감지 시 Unity 스크립트로 확정
                    if "MonoBehaviour" in class_info["inherits"]:
                        parsed_data["is_unity_script"] = True

                # --- 3. Interfaces ---
                elif capture_name == "interface_node":
                    interface_info = self._process_class_or_interface(node, node_type="interface")
                    parsed_data["interfaces"].append(interface_info)

                # --- 4. LINQ Queries ---
                elif capture_name == "linq_expr":
                    parsed_data["linq_query_count"] += 1

        except Exception:
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        import re
        c = self.content

        for m in re.finditer(r'^using\s+([\w.]+)\s*;', c, re.MULTILINE):
            name = m.group(1)
            parsed_data["usings"].append(name)
            if "UnityEngine" in name:
                parsed_data["is_unity_script"] = True

        for m in re.finditer(r'^(?:[\w\s]*\s)?namespace\s+([\w.]+)', c, re.MULTILINE):
            parsed_data["namespaces"].append(m.group(1))

        for m in re.finditer(r'^(?:[\w\s]*\s)?class\s+(\w+)', c, re.MULTILINE):
            name = m.group(1)
            line_ctx = c[m.start():m.start() + 200]
            parsed_data["classes"].append({"name": name, "inherits": [], "methods": [], "docstring": ""})
            if "MonoBehaviour" in line_ctx:
                parsed_data["is_unity_script"] = True

        for m in re.finditer(r'^(?:[\w\s]*\s)?interface\s+(\w+)', c, re.MULTILINE):
            parsed_data["interfaces"].append({"name": m.group(1), "inherits": [], "methods": [], "docstring": ""})

        parsed_data["linq_query_count"] = len(re.findall(r'\bfrom\s+\w+\s+in\s+', c))

    def _process_class_or_interface(self, node, node_type: str) -> Dict[str, Any]:
        """
        클래스나 인터페이스 노드를 받아 내부의 상속 관계와 메서드를 계층적으로 추출합니다.
        이렇게 해야 중첩 클래스(Nested Class)나 스코프 밖의 함수가 섞이는 것을 방지할 수 있습니다.
        """
        # 1. 이름 추출
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode('utf8', errors='ignore') if name_node else "Unknown"

        # 2. 상속/구현 (bases) 추출
        inherits = []
        bases_node = node.child_by_field_name("bases")
        if bases_node:
            # base_list 내부에 있는 타입 식별자들을 추출 (ex: MonoBehaviour, IDisposable)
            for child in bases_node.children:
                # ':' 기호 등은 제외하고 실제 타입 이름만 추출
                if child.type not in [":", ","]:
                    inherits.append(child.text.decode('utf8', errors='ignore').strip())

        # 3. 내부 메서드 추출 (body 내부 탐색)
        methods = []
        body_node = node.child_by_field_name("body")
        if body_node:
            for child in body_node.children:
                # C#은 메서드 선언(method_declaration) 외에 생성자(constructor_declaration)도 존재
                if child.type in ["method_declaration", "constructor_declaration"]:
                    m_name_node = child.child_by_field_name("name")
                    if m_name_node:
                        methods.append(m_name_node.text.decode('utf8', errors='ignore'))

        # 4. Docstring (XML 주석 ///) 추출
        docstring = self._extract_docstring(node)

        return {
            "name": name,
            "inherits": inherits,
            "methods": methods,
            "docstring": docstring
        }

    def _extract_docstring(self, node) -> str:
        """
        C#의 전통적인 XML 주석(///) 또는 일반 주석(//, /* */)을 추출합니다.
        """
        if not node or not node.prev_sibling:
            return ""
        
        comments = []
        current = node.prev_sibling
        
        while current and current.type == "comment":
            # C# XML 주석의 경우 '/// <summary>' 형태를 띠므로, 보기 좋게 태그를 클리닝해줄 수도 있습니다.
            text = current.text.decode('utf8', errors='ignore').strip()
            comments.append(text)
            current = current.prev_sibling
            
        return "\n".join(reversed(comments)) if comments else ""