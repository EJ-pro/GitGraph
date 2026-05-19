"""
파서 출력 확인용 스크립트.
backend/ 디렉토리에서 실행: python test_parsers.py
"""
import sys
import json
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

from core.parser.factory import get_parser_result

# 언어 → 샘플 파일 경로 (backend/ 기준 상대경로)
SAMPLES = {
    "python":     "tests/samples/sample.py",
    "javascript": "tests/samples/sample.jsx",
    "java":       "tests/samples/Sample.java",
    "kotlin":     "tests/samples/MainActivity.kt",
    "go":         "tests/samples/main.go",
    "rust":       "tests/samples/main.rs",
    "cpp":        "tests/samples/engine.cpp",
    "csharp":     "tests/samples/UserService.cs",
    "dart":       "tests/samples/home.dart",
    "php":        "tests/samples/UserController.php",
    "ruby":       "tests/samples/user.rb",
    "swift":      "tests/samples/ViewController.swift",
}

CHECKS = {
    "python": {
        "imports_contain": ["from .models import User, Project", "from ..core.cache import get_redis"],
        "classes_contain": ["DatabaseManager", "UserRepository"],
        "functions_contain": ["init_db"],
    },
    "javascript": {
        "imports_contain": ["react", "../api"],
        "is_react_component": True,
    },
    "java": {
        "imports_contain": ["com.app.model.User"],
        "classes_contain": ["UserService"],
        "package": "com.app.service",
    },
    "kotlin": {
        "imports_contain": ["androidx.appcompat.app.AppCompatActivity"],
        "classes_contain": ["MainActivity"],
        "is_android_project": True,
    },
    "go": {
        "imports_contain": ["net/http", "github.com/gin-gonic/gin"],
        "structs_contain": ["Server"],
        "functions_contain": ["NewServer", "main"],
        "is_main_package": True,
    },
    "rust": {
        "uses_contain": ["std::collections::HashMap"],
        "mods_contain": ["config"],
        "structs_contain": ["AppState"],
        "functions_contain": ["run_server", "main"],
    },
    "cpp": {
        "imports_contain": ["iostream", "my_header.h"],
        "classes_contain": ["Animal", "Dog"],
        "functions_contain": ["add", "main"],
    },
    "csharp": {
        "usings_contain": ["System.Linq"],
        "namespaces_contain": ["App.Services"],
        "classes_contain": ["UserService"],
        "interfaces_contain": ["IUserService"],
    },
    "dart": {
        "imports_contain": ["package:flutter/material.dart"],
        "classes_contain": ["MyApp", "CounterPage"],
        "is_flutter_script": True,
        "has_build_method": True,
    },
    "php": {
        "classes_contain": ["UserController"],
        "functions_contain": ["format_user_name"],
        "is_laravel": True,
    },
    "ruby": {
        "requires_contain": ["rails"],
        "modules_contain": ["ApplicationHelper"],
        "classes_contain": ["User"],
        "is_rails": True,
    },
    "swift": {
        "imports_contain": ["SwiftUI"],
        "protocols_contain": ["Drawable"],
        "classes_contain": ["ViewController"],
        "structs_contain": ["ContentView"],
        "is_swiftui": True,
    },
}


def check(_lang: str, parsed: dict, checks: dict) -> list[str]:
    failures = []
    for key, expected in checks.items():
        if key.endswith("_contain"):
            field = key[:-len("_contain")]
            actual = parsed.get(field, [])
            if actual and isinstance(actual[0], dict):
                actual_names = [item.get("name", item.get("target", "")) for item in actual]
            else:
                actual_names = actual
            for val in expected:
                if not any(val in str(item) for item in actual_names):
                    failures.append(f"  ✗ {field} missing '{val}'")
        else:
            actual = parsed.get(key)
            if actual != expected:
                failures.append(f"  ✗ {key}: expected={expected}, got={actual}")
    return failures


def main():
    total_pass = 0
    total_fail = 0

    for lang, rel_path in SAMPLES.items():
        sample_file = Path(rel_path)
        if not sample_file.exists():
            print(f"\n  ⚠ {lang.upper()}: sample file not found — {rel_path}")
            total_fail += 1
            continue

        code = sample_file.read_text(encoding='utf-8')
        result = get_parser_result(rel_path, code)
        parsed = result.get("metadata_json", {}).get("parsed", {})
        parse_error = result.get("error") or parsed.get("error") or ""

        print(f"\n{'='*50}")
        print(f"  {lang.upper()}  ({rel_path})")
        print(f"{'='*50}")

        if parse_error:
            print(f"  ⚠ Parser error: {parse_error}")

        summary = {k: v for k, v in parsed.items()
                   if k not in ("file_path",) and v not in ([], {}, False, "", None)}
        print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))

        failures = check(lang, parsed, CHECKS.get(lang, {}))
        if failures:
            print("\n  FAILED:")
            for f in failures:
                print(f)
            total_fail += len(failures)
        else:
            print("\n  ✓ All checks passed")
            total_pass += 1

    print(f"\n{'='*50}")
    print(f"Result: {total_pass}/{len(SAMPLES)} languages fully passed")
    if total_fail:
        print(f"        {total_fail} check(s) failed — see above")


if __name__ == "__main__":
    main()
