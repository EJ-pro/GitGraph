from typing import Dict, Any
from ..tree_sitter_base import BaseTreeSitterParser

class SwiftParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": self.file_path,
            "language": "swift",
            "imports": [],             # import UIKit, SwiftUI 등
            "protocols": [],           # protocol 선언
            "classes": [],             # class 선언
            "structs": [],             # struct 선언
            "enums": [],               # enum 선언
            "is_swiftui": False        # SwiftUI View 여부
        }

        # 1. Swift 문법에 맞춘 Tree-sitter Query
        query_source = """
        ;; 1. Import 추출
        (import_declaration (type_identifier) @import_name)
        (import_declaration (path_component (identifier) @import_name))

        ;; 2. Protocol, Class, Struct, Enum 선언 추출
        (protocol_declaration (type_identifier) @protocol_name) @protocol_node
        (class_declaration (type_identifier) @class_name) @class_node
        (struct_declaration (type_identifier) @struct_name) @struct_node
        (enum_declaration (type_identifier) @enum_name) @enum_node

        ;; 3. 상속 및 프로토콜 채택 추출
        (type_inheritance_clause (type_identifier) @inherited_type)

        ;; 4. 함수 및 메서드 선언 추출
        (function_declaration (simple_identifier) @func_name) @func_node
        """

        try:
            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            for node, capture_name in captures:
                node_text = node.text.decode('utf8', errors='ignore')

                # --- 1. Imports ---
                if capture_name == "import_name":
                    if node_text not in parsed_data["imports"]:
                        parsed_data["imports"].append(node_text)
                    if node_text == "SwiftUI":
                        parsed_data["is_swiftui"] = True

                # --- 2. Protocols, Classes, Structs, Enums ---
                elif capture_name in ["protocol_name", "class_name", "struct_name", "enum_name"]:
                    category = capture_name.split('_')[0] + "s" # e.g., classes, structs
                    parsed_data[category].append(self._process_swift_node(node.parent, category[:-1]))

                # --- 3. SwiftUI Detection (View 프로토콜 채택 여부) ---
                elif capture_name == "inherited_type":
                    if node_text == "View":
                        parsed_data["is_swiftui"] = True

        except Exception:
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        import re
        c = self.content

        for m in re.finditer(r'^import\s+(\w+)', c, re.MULTILINE):
            name = m.group(1)
            if name not in parsed_data["imports"]:
                parsed_data["imports"].append(name)
            if name == "SwiftUI":
                parsed_data["is_swiftui"] = True

        for m in re.finditer(r'^(?:\w+\s+)*protocol\s+(\w+)', c, re.MULTILINE):
            parsed_data["protocols"].append({
                "name": m.group(1), "type": "protocol",
                "inherits": [], "methods": [], "docstring": ""
            })

        for m in re.finditer(r'^(?:\w+\s+)*class\s+(\w+)', c, re.MULTILINE):
            parsed_data["classes"].append({
                "name": m.group(1), "type": "class",
                "inherits": [], "methods": [], "docstring": ""
            })

        for m in re.finditer(r'^(?:\w+\s+)*struct\s+(\w+)', c, re.MULTILINE):
            parsed_data["structs"].append({
                "name": m.group(1), "type": "struct",
                "inherits": [], "methods": [], "docstring": ""
            })

        for m in re.finditer(r'^(?:\w+\s+)*enum\s+(\w+)', c, re.MULTILINE):
            parsed_data["enums"].append({
                "name": m.group(1), "type": "enum",
                "inherits": [], "methods": [], "docstring": ""
            })

        if "SwiftUI" in parsed_data["imports"] and re.search(r'\bView\b', c):
            parsed_data["is_swiftui"] = True

    def _process_swift_node(self, node, node_type: str) -> Dict[str, Any]:
        """Swift의 타입(Class, Struct 등) 내부 구조를 분석합니다."""
        # 이름 추출
        name = "Unknown"
        for child in node.children:
            if child.type == "type_identifier":
                name = child.text.decode('utf8', errors='ignore')
                break

        # 상속/채택 추출
        inherits = []
        inheritance_clause = None
        for child in node.children:
            if child.type == "type_inheritance_clause":
                inheritance_clause = child
                break
        
        if inheritance_clause:
            for child in inheritance_clause.children:
                if child.type == "type_identifier":
                    inherits.append(child.text.decode('utf8', errors='ignore'))

        # 내부 메서드 추출
        methods = []
        # Swift는 중첩 구조가 복잡하므로 단순 children 순회로 메서드 선언을 찾음
        body = None
        for child in node.children:
            if child.type in ["class_body", "struct_body", "enum_body", "protocol_body"]:
                body = child
                break
        
        if body:
            for child in body.children:
                if child.type == "function_declaration":
                    # 함수 이름 노드 찾기
                    for sub in child.children:
                        if sub.type == "simple_identifier":
                            methods.append(sub.text.decode('utf8', errors='ignore'))

        return {
            "name": name,
            "type": node_type,
            "inherits": inherits,
            "methods": methods,
            "docstring": self._extract_docstring(node)
        }

    def _extract_docstring(self, node) -> str:
        """Swift의 문서화 주석 (/// 또는 /** */) 추출"""
        if not node or not node.prev_sibling:
            return ""
        comments = []
        current = node.prev_sibling
        while current and current.type in ["comment", "multiline_comment"]:
            comments.append(current.text.decode('utf8', errors='ignore').strip())
            current = current.prev_sibling
        return "\n".join(reversed(comments)) if comments else ""
