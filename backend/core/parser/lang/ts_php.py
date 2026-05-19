from typing import Dict, Any
from ..tree_sitter_base import BaseTreeSitterParser

class PhpParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": self.file_path,
            "language": "php",
            "namespace": None,
            "uses": [],                # use Namespace\Class;
            "classes": [],             # class, trait, interface
            "functions": [],           # global functions
            "is_laravel": False,
            "is_wordpress": False
        }

        # 1. PHP 문법에 맞춘 Tree-sitter Query
        query_source = """
        ;; 1. 네임스페이스 정의 추출
        (namespace_definition (namespace_name) @namespace_name)

        ;; 2. Use 구문(Import) 추출
        (namespace_use_declaration (namespace_use_clause (qualified_name) @use_name))

        ;; 3. 클래스, 인터페이스, 트레이트 선언 추출
        (class_declaration name: (name) @class_name) @class_node
        (interface_declaration name: (name) @interface_name) @interface_node
        (trait_declaration name: (name) @trait_name) @trait_node

        ;; 4. 함수 및 메서드 선언 추출
        (function_declaration name: (name) @func_name) @func_node
        (method_declaration name: (name) @method_name) @method_node
        """

        try:
            # 콘텐츠에 <?php 태그가 없으면 Tree-sitter PHP 파서가 잘 작동하지 않을 수 있으므로 텍스트 확인
            if "<?php" not in self.content and "<?=" not in self.content:
                # 템플릿 파일이거나 순수 로직 파일이 아닐 경우
                pass

            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            for node, capture_name in captures:
                node_text = node.text.decode('utf8', errors='ignore')

                # --- 1. Namespace & Uses ---
                if capture_name == "namespace_name":
                    parsed_data["namespace"] = node_text
                elif capture_name == "use_name":
                    parsed_data["uses"].append(node_text)
                    # Laravel 프레임워크 감지
                    if "Illuminate\\" in node_text:
                        parsed_data["is_laravel"] = True

                # --- 2. Classes, Interfaces, Traits ---
                elif capture_name in ["class_name", "interface_name", "trait_name"]:
                    type_str = capture_name.split('_')[0]
                    parsed_data["classes"].append(self._process_php_node(node.parent, type_str))

                # --- 3. Global Functions ---
                elif capture_name == "func_name":
                    # 클래스 외부의 전역 함수만 추출
                    if self._is_global_scope(node):
                        parsed_data["functions"].append({
                            "name": node_text,
                            "docstring": self._extract_docstring(node.parent)
                        })
                
                # --- 4. WordPress 감지 힌트 ---
                if "wp_" in node_text or "add_action" in node_text:
                    parsed_data["is_wordpress"] = True

        except Exception:
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        import re
        c = self.content

        m = re.search(r'^namespace\s+([\w\\]+)\s*;', c, re.MULTILINE)
        if m:
            parsed_data["namespace"] = m.group(1)

        for m in re.finditer(r'^use\s+([\w\\]+)\s*;', c, re.MULTILINE):
            name = m.group(1)
            parsed_data["uses"].append(name)
            if "Illuminate\\" in name:
                parsed_data["is_laravel"] = True

        for m in re.finditer(r'^(?:abstract\s+|final\s+)?class\s+(\w+)', c, re.MULTILINE):
            parsed_data["classes"].append({
                "name": m.group(1), "type": "class",
                "inherits": [], "methods": [], "docstring": ""
            })

        for m in re.finditer(r'^interface\s+(\w+)', c, re.MULTILINE):
            parsed_data["classes"].append({
                "name": m.group(1), "type": "interface",
                "inherits": [], "methods": [], "docstring": ""
            })

        for m in re.finditer(r'^function\s+(\w+)\s*\(', c, re.MULTILINE):
            parsed_data["functions"].append({"name": m.group(1), "docstring": ""})

        if re.search(r'\bwp_\w+\s*\(|\badd_action\s*\(', c):
            parsed_data["is_wordpress"] = True

    def _process_php_node(self, node, node_type: str) -> Dict[str, Any]:
        """PHP 클래스/인터페이스/트레이트 내부 구조를 분석합니다."""
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode('utf8', errors='ignore') if name_node else "Unknown"

        # 상속 및 구현 분석
        inherits = []
        extends_node = node.child_by_field_name("extends")
        if extends_node:
            inherits.append(extends_node.text.decode('utf8', errors='ignore').replace('extends', '').strip())
        
        implements_node = node.child_by_field_name("implements")
        if implements_node:
            inherits.append(implements_node.text.decode('utf8', errors='ignore').replace('implements', '').strip())

        # 메서드 추출
        methods = []
        body = node.child_by_field_name("body")
        if body:
            for child in body.children:
                if child.type == "method_declaration":
                    m_name_node = child.child_by_field_name("name")
                    if m_name_node:
                        methods.append(m_name_node.text.decode('utf8', errors='ignore'))

        return {
            "name": name,
            "type": node_type,
            "inherits": inherits,
            "methods": methods,
            "docstring": self._extract_docstring(node)
        }

    def _is_global_scope(self, node) -> bool:
        """노드가 클래스나 메서드 내부가 아닌 전역 스코프에 있는지 확인합니다."""
        curr = node.parent
        while curr:
            if curr.type in ["class_declaration", "interface_declaration", "trait_declaration"]:
                return False
            curr = curr.parent
        return True

    def _extract_docstring(self, node) -> str:
        """PHPDoc (/** ... */) 또는 일반 주석을 추출합니다."""
        if not node or not node.prev_sibling:
            return ""
        comments = []
        current = node.prev_sibling
        while current and current.type in ["comment"]:
            text = current.text.decode('utf8', errors='ignore').strip()
            comments.append(text)
            current = current.prev_sibling
        return "\n".join(reversed(comments)) if comments else ""
