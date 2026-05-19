from typing import Dict, Any, List
from ..tree_sitter_base import BaseTreeSitterParser

import ast

class PythonParser(BaseTreeSitterParser):
    def parse(self) -> Dict[str, Any]:
        meta = self.extract_base_metadata()
        
        parsed_data = {
            "file_path": meta.get("file_path", ""),
            "language": "python",
            "imports": [],
            "classes": [],
            "functions": [],
            "is_ai_or_data_project": False,
            "is_web_backend": False
        }

        try:
            tree = ast.parse(self.content)
            
            for node in ast.walk(tree):
                # --- 1. Imports ---
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        import_text = f"import {alias.name}"
                        parsed_data["imports"].append(import_text)
                elif isinstance(node, ast.ImportFrom):
                    dots = "." * (node.level or 0)  # 상대 임포트 점 보존
                    module = node.module or ""
                    names = ", ".join([a.name for a in node.names])
                    import_text = f"from {dots}{module} import {names}"
                    parsed_data["imports"].append(import_text)

                # --- 2. Classes ---
                elif isinstance(node, ast.ClassDef):
                    class_info = self._process_class(node)
                    parsed_data["classes"].append(class_info)

                # --- 3. Functions (모듈 레벨) ---
                elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                    # For simplicity, if it's walked directly under module it's module level,
                    # but simple `ast.walk` throws all functions. To filter out methods, check `isinstance` on proper node tree.
                    # As a heuristic, if it has 'self' as first arg, it might be a method, but usually we just want all of them.
                    func_info = self._process_function(node)
                    parsed_data["functions"].append(func_info)

            # 생태계 추론 로직
            all_imports = " ".join(parsed_data["imports"]).lower()
            if any(pkg in all_imports for pkg in ["torch", "tensorflow", "pandas", "numpy", "scikit"]):
                parsed_data["is_ai_or_data_project"] = True
            if any(pkg in all_imports for pkg in ["fastapi", "django", "flask", "starlette"]):
                parsed_data["is_web_backend"] = True

        except Exception as e:
            meta["error"] = f"Error during Python parsing: {str(e)}"

        meta["metadata_json"]["parsed"] = parsed_data
        return meta

    def _process_class(self, node) -> Dict[str, Any]:
        name = node.name
        inherits = [base.id for base in node.bases if isinstance(base, ast.Name)]
        decorators = [ast.unparse(d) if hasattr(ast, 'unparse') else "decorator" for d in node.decorator_list]
        docstring = ast.get_docstring(node) or ""
        methods = [n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        return {
            "name": name,
            "inherits": inherits,
            "decorators": decorators,
            "methods": methods,
            "docstring": docstring
        }

    def _process_function(self, node) -> Dict[str, Any]:
        decorators = [ast.unparse(d) if hasattr(ast, 'unparse') else "decorator" for d in node.decorator_list]
        docstring = ast.get_docstring(node) or ""
        return {
            "name": node.name,
            "decorators": decorators,
            "docstring": docstring
        }