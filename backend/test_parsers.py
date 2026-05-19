"""
파서 출력 확인용 스크립트.
backend/ 디렉토리에서 실행: python test_parsers.py
"""
import json
from core.parser.factory import get_parser_result

SAMPLES = {
    "python": ("src/app/database.py", """\
from .models import User, Project
from ..core.cache import get_redis
from fastapi import Depends
import os

class DatabaseManager:
    def __init__(self):
        self.url = os.getenv("DATABASE_URL")

    def get_session(self):
        pass

def init_db():
    pass
"""),

    "javascript": ("src/components/Chat.jsx", """\
import React, { useState } from 'react';
import { authService } from '../api';
import axios from 'axios';

class ChatComponent extends React.Component {}

export default function Chat() {
  const [msg, setMsg] = useState('');
  return <div>{msg}</div>;
}
"""),

    "java": ("src/main/java/com/app/UserService.java", """\
package com.app.service;

import com.app.model.User;
import org.springframework.stereotype.Service;
import java.util.List;

public class UserService extends BaseService implements IUserService {
    public User findById(Long id) { return null; }
}
"""),

    "kotlin": ("src/main/kotlin/com/app/MainActivity.kt", """\
package com.app

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }
}

fun greet(name: String): String = "Hello, $name"
"""),

    "go": ("cmd/server/main.go", """\
package main

import (
    "fmt"
    "net/http"
    "github.com/gin-gonic/gin"
)

type Server struct {
    port int
}

type Handler interface {
    Handle(ctx *gin.Context)
}

func (s *Server) Start() {
    fmt.Println("starting")
}

func NewServer(port int) *Server {
    return &Server{port: port}
}

func main() {
    go NewServer(8080).Start()
}
"""),

    "rust": ("src/main.rs", """\
use std::collections::HashMap;
use tokio::net::TcpListener;

mod config;
mod handlers;

pub struct AppState {
    pub db: HashMap<String, String>,
}

pub enum AppError {
    NotFound,
    Internal,
}

pub trait Service {
    fn handle(&self) -> Result<(), AppError>;
}

impl Service for AppState {
    fn handle(&self) -> Result<(), AppError> {
        Ok(())
    }
}

pub async fn run_server(addr: &str) {
    let _listener = TcpListener::bind(addr).await.unwrap();
}

fn main() {}
"""),
}

CHECKS = {
    "python": {
        "imports_contain": ["from .models import User, Project", "from ..core.cache import get_redis"],
        "classes_contain": ["DatabaseManager"],
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
}


def check(lang: str, parsed: dict, checks: dict) -> list[str]:
    failures = []
    for key, expected in checks.items():
        if key.endswith("_contain"):
            field = key[:-len("_contain")]
            actual = parsed.get(field, [])
            # structs/functions may be list of dicts
            if actual and isinstance(actual[0], dict):
                actual_names = [item.get("name", "") for item in actual]
            else:
                actual_names = actual
            for val in expected:
                found = any(val in str(item) for item in actual_names)
                if not found:
                    failures.append(f"  ✗ {field} missing '{val}'")
        else:
            actual = parsed.get(key)
            if actual != expected:
                failures.append(f"  ✗ {key}: expected={expected}, got={actual}")
    return failures


def main():
    total_pass = 0
    total_fail = 0

    for lang, (path, code) in SAMPLES.items():
        result = get_parser_result(path, code)
        parsed = result.get("metadata_json", {}).get("parsed", {})
        parse_error = result.get("error") or parsed.get("error") or ""

        print(f"\n{'='*50}")
        print(f"  {lang.upper()}  ({path})")
        print(f"{'='*50}")

        if parse_error:
            print(f"  ⚠ Parser error: {parse_error}")

        # 핵심 필드만 출력
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
