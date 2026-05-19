from typing import Dict, Any
from ..tree_sitter_base import BaseTreeSitterParser

class DartParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": meta.get("file_path", ""),
            "language": "dart",
            "imports": [],             # import 'package:flutter/material.dart';
            "classes": [],             # 클래스 정보 (Stateless/Stateful 여부 포함)
            "is_flutter_script": False,# Flutter UI 스크립트 여부
            "has_build_method": False  # 화면을 그리는 build() 존재 여부
        }

        # 1. Dart 문법에 맞춘 Tree-sitter Query
        query_source = """
        ;; 1. Import 구문의 URI 캡처 (package:flutter 등)
        (import_directive uri: (string_literal) @import_uri)

        ;; 2. Class 선언 및 부모 클래스(상속), Mixin(with), Interface(implements) 캡처
        (class_definition
            name: (identifier) @class_name
            superclass: (superclass (type_identifier) @base_class)?
            interfaces: (interfaces (type_list (type_identifier) @interface_name))?
            mixins: (mixins (type_list (type_identifier) @mixin_name))?
        ) @class_node
        """

        try:
            query = self.language.query(query_source)
            captures = query.captures(self.root_node)

            for node, capture_name in captures:
                node_text = node.text.decode('utf8', errors='ignore')
                
                # --- 1. Imports ---
                if capture_name == "import_uri":
                    # 따옴표 제거 ('package:flutter/material.dart' -> package:flutter/material.dart)
                    uri_text = node_text.strip("'\"")
                    parsed_data["imports"].append(uri_text)
                    
                    # Flutter UI 컴포넌트 여부 감지
                    if uri_text.startswith("package:flutter/"):
                        parsed_data["is_flutter_script"] = True

                # --- 2. Class & Widgets (Stateful/Stateless) ---
                elif capture_name == "class_node":
                    class_info = self._process_dart_class(node)
                    parsed_data["classes"].append(class_info)
                    
                    # 클래스 중 하나라도 Flutter의 Widget을 상속받았다면 UI 파일로 간주
                    if class_info["widget_type"] != "none":
                        parsed_data["is_flutter_script"] = True
                    
                    # build 메서드가 존재하는지 확인 (UI 렌더링 클래스)
                    if "build" in class_info["methods"]:
                        parsed_data["has_build_method"] = True

        except Exception:
            self._parse_regex(parsed_data)

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _parse_regex(self, parsed_data: dict) -> None:
        import re
        c = self.content

        for m in re.finditer(r"^import\s+['\"]([^'\"]+)['\"]", c, re.MULTILINE):
            uri = m.group(1)
            parsed_data["imports"].append(uri)
            if uri.startswith("package:flutter/"):
                parsed_data["is_flutter_script"] = True

        for m in re.finditer(r'^class\s+(\w+)(?:\s+extends\s+(\w+))?', c, re.MULTILINE):
            name, base = m.group(1), m.group(2) or ""
            widget_type = "none"
            if base == "StatelessWidget":
                widget_type = "stateless"
                parsed_data["is_flutter_script"] = True
            elif base == "StatefulWidget":
                widget_type = "stateful"
                parsed_data["is_flutter_script"] = True
            parsed_data["classes"].append({
                "name": name, "inherits": base, "mixins": [],
                "interfaces": [], "widget_type": widget_type,
                "methods": [], "docstring": ""
            })

        if re.search(r'\bbuild\s*\(', c):
            parsed_data["has_build_method"] = True

    def _process_dart_class(self, node) -> Dict[str, Any]:
        """
        Dart 클래스의 내부 구조를 분석하여 Widget 타입과 메서드, 주석을 추출합니다.
        """
        # 1. 클래스 이름 추출
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode('utf8', errors='ignore') if name_node else "Unknown"

        # 2. 상속(extends) 분석 -> Flutter Widget 타입 분류
        base_class_name = ""
        widget_type = "none" # none, stateless, stateful, state, provider
        
        superclass_node = node.child_by_field_name("superclass")
        if superclass_node:
            for child in superclass_node.children:
                if child.type == "type_identifier":
                    base_class_name = child.text.decode('utf8', errors='ignore')
                    break
            
            if base_class_name == "StatelessWidget":
                widget_type = "stateless"
            elif base_class_name == "StatefulWidget":
                widget_type = "stateful"
            elif base_class_name.startswith("State<"): 
                widget_type = "state_logic"
            elif base_class_name == "InheritedWidget":
                widget_type = "inherited_widget"

        # 3. Mixin(with) 및 Interface(implements) 추출
        mixins = []
        mixins_node = node.child_by_field_name("mixins")
        if mixins_node:
            type_list = mixins_node.child_by_field_name("types")
            if type_list:
                for child in type_list.children:
                    if child.type == "type_identifier":
                        m_name = child.text.decode('utf8', errors='ignore')
                        mixins.append(m_name)
                        if m_name == "ChangeNotifier":
                            widget_type = "provider/notifier"

        interfaces = []
        interfaces_node = node.child_by_field_name("interfaces")
        if interfaces_node:
            type_list = interfaces_node.child_by_field_name("types")
            if type_list:
                for child in type_list.children:
                    if child.type == "type_identifier":
                        interfaces.append(child.text.decode('utf8', errors='ignore'))

        # 4. 클래스 내부 메서드 탐색
        methods = []
        body_node = node.child_by_field_name("body")
        if body_node:
            for child in body_node.children:
                if child.type == "method_declaration":
                    m_name_node = child.child_by_field_name("name")
                    if m_name_node:
                        methods.append(m_name_node.text.decode('utf8', errors='ignore'))

        # 5. Docstring (///) 추출
        docstring = self._extract_docstring(node)

        return {
            "name": name,
            "inherits": base_class_name,
            "mixins": mixins,
            "interfaces": interfaces,
            "widget_type": widget_type,
            "methods": methods,
            "docstring": docstring
        }

    def _extract_docstring(self, node) -> str:
        """
        Dart의 공식 문서화 주석인 /// 또는 //, /* */ 를 역추적하여 추출합니다.
        """
        if not node or not node.prev_sibling:
            return ""
        
        comments = []
        current = node.prev_sibling
        
        while current and current.type == "comment":
            comments.append(current.text.decode('utf8', errors='ignore').strip())
            current = current.prev_sibling
            
        return "\n".join(reversed(comments)) if comments else ""