from typing import Dict, Any, List
from ..tree_sitter_base import BaseTreeSitterParser

class RustParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": self.file_path,
            "language": "rust",
            "uses": [],                # use std::collections::HashMap;
            "mods": [],                # mod my_module;
            "structs": [],             # struct MyStruct { ... }
            "enums": [],               # enum MyEnum { ... }
            "traits": [],              # trait MyTrait { ... }
            "impls": [],               # impl MyTrait for MyStruct { ... }
            "functions": []            # global/mod level functions
        }

        # 1. Rust 문법에 맞춘 Tree-sitter Query
        query_source = """
        ;; 1. Use (의존성) 추출
        (use_declaration argument: (_) @use_path)

        ;; 2. Mod 정의 추출
        (mod_item name: (identifier) @mod_name) @mod_node

        ;; 3. Struct, Enum, Trait 선언 추출
        (struct_item name: (type_identifier) @struct_name) @struct_node
        (enum_item name: (type_identifier) @enum_name) @enum_node
        (trait_item name: (type_identifier) @trait_name) @trait_node

        ;; 4. Impl 블록 추출 (Trait 구현 여부 포함)
        (impl_item
            trait: (type_identifier)? @impl_trait
            type: (type_identifier) @impl_struct
        ) @impl_node

        ;; 5. Function 추출
        (function_item name: (identifier) @func_name) @func_node
        """

        try:
            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            for node, capture_name in captures:
                node_text = node.text.decode('utf8', errors='ignore')

                # --- 1. Uses & Mods ---
                if capture_name == "use_path":
                    parsed_data["uses"].append(node_text)
                elif capture_name == "mod_name":
                    parsed_data["mods"].append({
                        "name": node_text,
                        "docstring": self._extract_docstring(node.parent)
                    })

                # --- 2. Types (Struct, Enum, Trait) ---
                elif capture_name in ["struct_name", "enum_name", "trait_name"]:
                    category = capture_name.split('_')[0] + "s"
                    parsed_data[category].append(self._process_rust_node(node.parent, category[:-1]))

                # --- 3. Impls ---
                elif capture_name == "impl_struct":
                    # trait_name이 있으면 'Trait for Struct', 없으면 'Struct'에 대한 직접 구현
                    trait_node = None
                    for sibling in node.parent.children:
                        if sibling.type == "type_identifier" and sibling != node:
                            trait_node = sibling
                            break
                    
                    parsed_data["impls"].append({
                        "struct": node_text,
                        "trait": trait_node.text.decode('utf8', errors='ignore') if trait_node else None,
                        "methods": self._extract_impl_methods(node.parent)
                    })

                # --- 4. Global Functions ---
                elif capture_name == "func_name":
                    if self._is_global_scope(node):
                        parsed_data["functions"].append({
                            "name": node_text,
                            "docstring": self._extract_docstring(node.parent)
                        })

        except Exception:
            # tree-sitter 미설치 시 regex fallback
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        """tree-sitter 없을 때 regex로 핵심 정보만 추출."""
        import re
        c = self.content

        # use std::collections::HashMap;
        for m in re.finditer(r"^use\s+([^;]+);", c, re.MULTILINE):
            parsed_data["uses"].append(m.group(1).strip())

        # mod my_module;
        for m in re.finditer(r"^mod\s+(\w+)\s*;", c, re.MULTILINE):
            parsed_data["mods"].append({"name": m.group(1), "docstring": ""})

        # struct / enum / trait
        for m in re.finditer(r"^(?:pub\s+)?struct\s+(\w+)", c, re.MULTILINE):
            parsed_data["structs"].append({"name": m.group(1), "type": "struct", "methods": [], "docstring": ""})
        for m in re.finditer(r"^(?:pub\s+)?enum\s+(\w+)", c, re.MULTILINE):
            parsed_data["enums"].append({"name": m.group(1), "type": "enum", "methods": [], "docstring": ""})
        for m in re.finditer(r"^(?:pub\s+)?trait\s+(\w+)", c, re.MULTILINE):
            parsed_data["traits"].append({"name": m.group(1), "type": "trait", "methods": [], "docstring": ""})

        # fn function_name(
        for m in re.finditer(r"^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(", c, re.MULTILINE):
            parsed_data["functions"].append({"name": m.group(1), "docstring": ""})

    def _process_rust_node(self, node, node_type: str) -> Dict[str, Any]:
        """Rust의 구조체, 열거형, 트레이트 내부를 분석합니다."""
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode('utf8', errors='ignore') if name_node else "Unknown"

        # Trait의 경우 내부 메서드 시그니처 추출 가능
        methods = []
        body = node.child_by_field_name("body")
        if body:
            for child in body.children:
                if child.type in ["function_item", "function_signature_item"]:
                    m_name_node = child.child_by_field_name("name")
                    if m_name_node:
                        methods.append(m_name_node.text.decode('utf8', errors='ignore'))

        return {
            "name": name,
            "type": node_type,
            "methods": methods,
            "docstring": self._extract_docstring(node)
        }

    def _extract_impl_methods(self, impl_node) -> List[str]:
        """impl 블록 내부에 정의된 메서드 이름들을 추출합니다."""
        methods = []
        body = impl_node.child_by_field_name("body")
        if body:
            for child in body.children:
                if child.type == "function_item":
                    name_node = child.child_by_field_name("name")
                    if name_node:
                        methods.append(name_node.text.decode('utf8', errors='ignore'))
        return methods

    def _is_global_scope(self, node) -> bool:
        """함수가 impl이나 trait 내부가 아닌 모듈/전역 레벨에 있는지 확인합니다."""
        curr = node.parent
        while curr:
            if curr.type in ["impl_item", "trait_item"]:
                return False
            curr = curr.parent
        return True

    def _extract_docstring(self, node) -> str:
        """Rust의 문서화 주석 (/// 또는 //!) 추출"""
        if not node or not node.prev_sibling:
            return ""
        comments = []
        current = node.prev_sibling
        while current and current.type in ["line_comment", "block_comment"]:
            text = current.text.decode('utf8', errors='ignore').strip()
            # Rust 특유의 /// 또는 //! 주석 위주로 수집 (추후 필터링 가능)
            comments.append(text)
            current = current.prev_sibling
        return "\n".join(reversed(comments)) if comments else ""
