import os
from .base import BaseResolver


class PythonResolver(BaseResolver):
    def resolve(self, path: str, import_str: str) -> list:
        targets = []

        # ── 1. Relative imports: from .foo import bar  /  from ..db import X ──
        raw = import_str
        if " import " in raw:
            module_part = raw.split(" import ")[0].replace("from", "").strip()
            symbols = [s.strip() for s in raw.split(" import ")[1].split(",")]
        else:
            module_part = raw.replace("import", "").strip()
            symbols = []

        if module_part.startswith("."):
            rel_targets = self._resolve_relative(path, module_part, symbols)
            targets.extend(rel_targets)

        # ── 2. Absolute imports ──
        if not module_part.startswith("."):
            if " import " in import_str:
                imp_module = import_str.split(" import ")[0].replace("from ", "").strip()
                imp_symbols = [s.strip() for s in import_str.split(" import ")[1].split(",")]

                for sym in imp_symbols:
                    full_module = f"{imp_module}.{sym}"
                    if full_module in self.entity_map:
                        targets.append(self.entity_map[full_module])
                    elif sym in self.entity_map:
                        targets.append(self.entity_map[sym])

                if imp_module in self.entity_map:
                    targets.append(self.entity_map[imp_module])
            else:
                for m in import_str.replace("import ", "").split(","):
                    m = m.strip()
                    if m in self.entity_map:
                        targets.append(self.entity_map[m])

        # ── 3. Fuzzy fallback via basename ──
        if not targets:
            clean = import_str.replace("from ", "").replace("import ", "").replace(",", " ")
            for w in clean.split():
                last = w.lstrip(".").split(".")[-1]
                if last in self.basename_map:
                    targets.append(self.basename_map[last])

        return list(set(targets))

    def _resolve_relative(self, source_path: str, module_part: str, symbols: list) -> list:
        """Resolve leading-dot relative imports to absolute paths.

        '.'  → same package directory
        '..' → one level up, etc.
        """
        # Count leading dots to determine how many levels to go up
        dots = len(module_part) - len(module_part.lstrip("."))
        rel_module = module_part.lstrip(".")  # e.g. "database.models" or ""

        # Start from the source file's directory
        source_dir = os.path.dirname(source_path).replace("\\", "/")
        parts = source_dir.split("/") if source_dir else []

        # Each extra dot beyond the first goes one directory up
        up = dots - 1
        if up > 0:
            parts = parts[:-up] if up < len(parts) else []

        base_dir = "/".join(parts)

        targets = []

        # Case A: `from .models import User` — rel_module is the file/package
        if rel_module:
            candidate_path = f"{base_dir}/{rel_module.replace('.', '/')}.py" if base_dir else f"{rel_module.replace('.', '/')}.py"
            if candidate_path in self.full_path_map:
                targets.append(candidate_path)
                return targets

            # Try each symbol as a sub-module: from .resolvers import python → resolvers/python.py
            for sym in symbols:
                sym_path = f"{base_dir}/{rel_module.replace('.', '/')}/{sym}.py" if base_dir else f"{rel_module.replace('.', '/')}/{sym}.py"
                if sym_path in self.full_path_map:
                    targets.append(sym_path)

            # entity_map lookup for the dotted module
            if candidate_path not in self.full_path_map:
                module_key = rel_module
                if module_key in self.entity_map:
                    targets.append(self.entity_map[module_key])

        else:
            # Case B: `from . import foo` — symbols are files in the same package
            for sym in symbols:
                sym_path = f"{base_dir}/{sym}.py" if base_dir else f"{sym}.py"
                if sym_path in self.full_path_map:
                    targets.append(sym_path)
                elif sym in self.basename_map:
                    targets.append(self.basename_map[sym])

        return targets
