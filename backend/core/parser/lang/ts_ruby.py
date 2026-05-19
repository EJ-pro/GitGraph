from typing import Dict, Any
from ..tree_sitter_base import BaseTreeSitterParser

class RubyParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": self.file_path,
            "language": "ruby",
            "requires": [],            # require '...' 또는 require_relative '...'
            "modules": [],             # module Name
            "classes": [],             # class Name < Base
            "methods": [],             # top-level methods (singleton or global)
            "is_rails": False          # Ruby on Rails 프로젝트 여부
        }

        # 1. Ruby 문법에 맞춘 Tree-sitter Query
        query_source = """
        ;; 1. Require (의존성) 추출
        (call
          method: (identifier) @method_name (#match? @method_name "^require(_relative)?$")
          arguments: (argument_list (string (string_content) @req_path))
        )

        ;; 2. Module 정의 추출
        (module
          name: [
            (constant) @module_name
            (scope_resolution) @module_name
          ]
        ) @module_node

        ;; 3. Class 정의 및 상속 추출
        (class
          name: [
            (constant) @class_name
            (scope_resolution) @class_name
          ]
          superclass: (superclass [
            (constant) @base_class
            (scope_resolution) @base_class
          ])?
        ) @class_node

        ;; 4. Method 정의 추출
        (method name: (identifier) @method_name) @method_node

        ;; 5. Singleton Method (self.method) 추출
        (singleton_method name: (identifier) @method_name) @method_node
        """

        try:
            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            for node, capture_name in captures:
                node_text = node.text.decode('utf8', errors='ignore')

                # --- 1. Requires ---
                if capture_name == "req_path":
                    parsed_data["requires"].append(node_text)
                    # Rails 관련 라이브러리 감지
                    if "rails" in node_text or "active_record" in node_text:
                        parsed_data["is_rails"] = True

                # --- 2. Modules ---
                elif capture_name == "module_name":
                    # 중복 방지를 위해 부모 노드 확인
                    parsed_data["modules"].append({
                        "name": node_text,
                        "docstring": self._extract_docstring(node.parent)
                    })

                # --- 3. Classes & Inheritance ---
                elif capture_name == "class_name":
                    class_info = self._process_ruby_class(node.parent)
                    parsed_data["classes"].append(class_info)
                    
                    # Rails Base Class 상속 여부 확인
                    if any("ApplicationRecord" in b or "ActiveRecord" in b for b in class_info["inherits"]):
                        parsed_data["is_rails"] = True

                # --- 4. Methods ---
                elif capture_name == "method_node":
                    # 클래스나 모듈 내부가 아닌 전역 메서드만 따로 추출
                    if self._is_global_scope(node):
                        method_name_node = node.child_by_field_name("name")
                        if method_name_node:
                            parsed_data["methods"].append({
                                "name": method_name_node.text.decode('utf8', errors='ignore'),
                                "docstring": self._extract_docstring(node)
                            })

        except Exception:
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        import re
        c = self.content

        for m in re.finditer(r"^require(?:_relative)?\s+['\"]([^'\"]+)['\"]", c, re.MULTILINE):
            path = m.group(1)
            parsed_data["requires"].append(path)
            if "rails" in path or "active_record" in path:
                parsed_data["is_rails"] = True

        for m in re.finditer(r'^module\s+(\w+)', c, re.MULTILINE):
            parsed_data["modules"].append({"name": m.group(1), "docstring": ""})

        for m in re.finditer(r'^class\s+(\w+)(?:\s*<\s*(\S+))?', c, re.MULTILINE):
            name, base = m.group(1), m.group(2) or ""
            if "ApplicationRecord" in base or "ActiveRecord" in base:
                parsed_data["is_rails"] = True
            parsed_data["classes"].append({
                "name": name, "inherits": [base] if base else [],
                "methods": [], "docstring": ""
            })

        for m in re.finditer(r'^def\s+(\w+)', c, re.MULTILINE):
            parsed_data["methods"].append({"name": m.group(1), "docstring": ""})

    def _process_ruby_class(self, node) -> Dict[str, Any]:
        """Ruby 클래스 내부의 상속 관계와 메서드를 분석합니다."""
        # 이름 추출
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode('utf8', errors='ignore') if name_node else "Unknown"

        # 상속(superclass) 추출
        inherits = []
        superclass_node = node.child_by_field_name("superclass")
        if superclass_node:
            inherits.append(superclass_node.text.decode('utf8', errors='ignore').replace('<', '').strip())

        # 메서드 추출 (body 내부 탐색 - body 필드가 명시적이지 않을 수 있어 children 순회)
        methods = []
        # Ruby grammar에서 class body는 보통 children 중 특정 타입을 가짐
        for child in node.children:
            if child.type == "method":
                m_name_node = child.child_by_field_name("name")
                if m_name_node:
                    methods.append(m_name_node.text.decode('utf8', errors='ignore'))
            elif child.type == "singleton_method":
                m_name_node = child.child_by_field_name("name")
                if m_name_node:
                    methods.append("self." + m_name_node.text.decode('utf8', errors='ignore'))

        return {
            "name": name,
            "inherits": inherits,
            "methods": methods,
            "docstring": self._extract_docstring(node)
        }

    def _is_global_scope(self, node) -> bool:
        """메서드가 클래스나 모듈의 내부가 아닌 최상위 레벨에 있는지 확인합니다."""
        curr = node.parent
        while curr:
            if curr.type in ["class", "module"]:
                return False
            curr = curr.parent
        return True

    def _extract_docstring(self, node) -> str:
        """Ruby의 주석(#)을 역추적하여 추출합니다."""
        if not node or not node.prev_sibling:
            return ""
        comments = []
        current = node.prev_sibling
        while current and current.type == "comment":
            comments.append(current.text.decode('utf8', errors='ignore').strip())
            current = current.prev_sibling
        return "\n".join(reversed(comments)) if comments else ""
