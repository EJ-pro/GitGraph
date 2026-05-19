from typing import Dict, Any, List
from ..tree_sitter_base import BaseTreeSitterParser

class CppParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        # 부모 클래스의 기본 메타데이터 추출
        meta = self.extract_base_metadata()
        
        # GraphRAG 엔진으로 보낼 표준 규격화 데이터
        parsed_data = {
            "file_path": meta.get("file_path", ""),
            "language": "cpp",
            "imports": [],      # #include <iostream> 등
            "macros": [],       # #define MAX_SIZE 100 등
            "classes": [],      # class, struct
            "functions": [],    # global / namespace functions
        }

        # 1. Tree-sitter Query 정의 (C/C++ 문법에 맞춘 AST 노드 탐색)
        query_source = """
        ;; 1. Include 추출 (system 헤더 <..> 및 local 헤더 "..")
        (preproc_include path: (_) @include_path)

        ;; 2. Macro 추출 (#define)
        (preproc_def name: (identifier) @macro_name value: (_)? @macro_val)

        ;; 3. Class 및 Struct 추출
        (class_specifier name: (type_identifier)? @class_name)
        (struct_specifier name: (type_identifier)? @struct_name)

        ;; 4. Function 추출 (선언 및 정의 모두 포함)
        (function_definition declarator: (_) @func_name)
        (declaration declarator: (_) @func_name)
        """

        try:
            # 언어 객체(self.language)로 쿼리 생성 및 실행
            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            current_class_methods = []

            for node, capture_name in captures:
                # 텍스트 추출 유틸리티 (부모 클래스에 없다면 utf-8 디코딩 사용)
                node_text = node.text.decode('utf8', errors='ignore')

                # --- 1. Imports (#include) ---
                if capture_name == "include_path":
                    # <iostream> 또는 "my_header.h" 형태
                    clean_path = node_text.strip('<>"')
                    parsed_data["imports"].append({
                        "target": clean_path,
                        "alias": None,
                        "type": "system" if node_text.startswith("<") else "local"
                    })

                # --- 2. Macros (#define) ---
                elif capture_name == "macro_name":
                    # 매크로 이름 임시 저장 (value 캡처와 짝을 맞추기 위함)
                    self._current_macro_name = node_text
                elif capture_name == "macro_val":
                    parsed_data["macros"].append({
                        "name": getattr(self, "_current_macro_name", "UNKNOWN"),
                        "value": node_text.strip()
                    })

                # --- 3. Classes & Structs ---
                elif capture_name in ["class_name", "struct_name"]:
                    docstring = self._extract_docstring(node.parent)
                    parsed_data["classes"].append({
                        "name": node_text,
                        "type": "class" if capture_name == "class_name" else "struct",
                        "methods": [], # 필요 시 중첩 쿼리로 내부 함수 추출
                        "docstring": docstring
                    })

                # --- 4. Functions ---
                elif capture_name == "func_name":
                    # 함수가 클래스 내부에 속해 있는지 확인 (간단한 부모 노드 검사)
                    parent = node.parent
                    is_method = False
                    while parent:
                        if parent.type in ["class_specifier", "struct_specifier"]:
                            is_method = True
                            break
                        parent = parent.parent
                    
                    if not is_method:
                        docstring = self._extract_docstring(node.parent.parent)
                        parsed_data["functions"].append({
                            "name": node_text,
                            "docstring": docstring
                        })

        except Exception:
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        import re
        c = self.content

        for m in re.finditer(r'#include\s*([<"][^>"]+[>"])', c):
            raw = m.group(1)
            parsed_data["imports"].append({
                "target": raw.strip('<>"'),
                "alias": None,
                "type": "system" if raw.startswith("<") else "local",
            })
        for m in re.finditer(r"#define\s+(\w+)\s*(.*)", c):
            parsed_data["macros"].append({"name": m.group(1), "value": m.group(2).strip()})
        for m in re.finditer(r"(?:class|struct)\s+(\w+)", c):
            parsed_data["classes"].append({"name": m.group(1), "type": "class", "methods": [], "docstring": ""})
        for m in re.finditer(r"^[\w:*&<> ]+\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{", c, re.MULTILINE):
            name = m.group(1)
            if name not in ("if", "for", "while", "switch"):
                parsed_data["functions"].append({"name": name, "docstring": ""})

    def _extract_docstring(self, node) -> str:
        """
        특정 노드(클래스/함수) 바로 위에 있는 주석(Comment)을 추출합니다.
        """
        if not node or not node.prev_sibling:
            return ""
        
        comments = []
        current = node.prev_sibling
        # 연속된 주석 블록(// 또는 /* ... */)을 모두 수집
        while current and current.type == "comment":
            comments.append(current.text.decode('utf8', errors='ignore').strip())
            current = current.prev_sibling
            
        return "\n".join(reversed(comments)) if comments else ""

