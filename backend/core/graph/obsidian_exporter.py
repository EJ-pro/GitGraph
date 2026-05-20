import os
import zipfile
import io
import networkx as nx

def export_to_obsidian(project, files, graph: nx.DiGraph) -> io.BytesIO:
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        # 1. Create a README.md dashboard for the vault
        repo_name = project.repo_url.split('/')[-1] if project.repo_url else "Repository"
        readme_content = f"""# 🕸️ GitGraph Vault - {repo_name}

Welcome to the Obsidian Vault generated for **[{repo_name}]({project.repo_url})**.

## 📊 Repository Summary
- **Total Files**: {project.file_count or len(files)}
- **Dependencies Detected**: {project.edge_count or graph.number_of_edges()}
- **Analysis Date**: {project.created_at.strftime("%Y-%m-%d %H:%M:%S") if project.created_at else "N/A"}

## 🗺️ How to Explore
1. **Graph View**: Open Obsidian's **Graph View** (Ctrl+G or Cmd+G) to see the entire file dependency map of this codebase!
2. **Interactive Navigation**: Use `Ctrl+Click` (or `Cmd+Click`) on double-bracket links `[[like this]]` in any note to navigate between files and their dependencies.

## 🔑 Key Files (High Importance)
"""
        # Sort files by importance score descending to list top files
        sorted_files = sorted(files, key=lambda x: x.importance_score or 0, reverse=True)
        for f in sorted_files[:15]:
            readme_content += f"- [[{f.file_path}]] (Importance Score: {f.importance_score or 0})\n"

        # If project has generated readme, we can also include it as a separate file
        if project.readmes:
            # Get latest readme
            latest_readme = sorted(project.readmes, key=lambda x: x.created_at, reverse=True)[0]
            zip_file.writestr("PROJECT_README.md", latest_readme.content)
            readme_content += "\n## 📄 Generated AI README\n- [[PROJECT_README|Open AI-Generated Project README]]\n"
            
        zip_file.writestr("README.md", readme_content)

        # 2. Create a Markdown file for each source file
        for pf in files:
            path = pf.file_path
            filename = os.path.basename(path)
            ext = path.split('.')[-1].lower() if '.' in path else ''
            
            meta = pf.metadata_json or {}
            parsed = meta.get("parsed", {})
            lang = parsed.get("language", ext)
            
            # YAML Frontmatter
            frontmatter = f"""---
path: "{path}"
language: "{lang}"
importance_score: {pf.importance_score or 0}
line_count: {pf.line_count or 0}
file_size: {pf.file_size or 0}
tags:
  - codebase-file
  - {lang or "unknown"}
---
"""
            # Title
            content = frontmatter
            content += f"# {path}\n\n"
            
            # Stats table
            content += f"| Metric | Value |\n"
            content += f"| :--- | :--- |\n"
            content += f"| **Language** | `{lang}` |\n"
            content += f"| **Importance Score** | {pf.importance_score or 0} |\n"
            content += f"| **Lines** | {pf.line_count or 0} |\n"
            content += f"| **Size** | {pf.file_size or 0} bytes |\n\n"

            # Parse Classes & Functions
            classes = parsed.get("classes", [])
            functions = parsed.get("functions", [])
            
            if classes:
                content += "## 🏫 Classes\n"
                for cls in classes:
                    if isinstance(cls, dict):
                        cls_name = cls.get("name", "Unknown")
                        inherits = cls.get("inherits", [])
                        inherits_str = f" (inherits `{', '.join(inherits)}`)" if inherits else ""
                        content += f"### `class {cls_name}`{inherits_str}\n"
                        doc = cls.get("docstring", "").strip()
                        if doc:
                            content += f"> {doc}\n\n"
                        methods = cls.get("methods", [])
                        if methods:
                            content += "- **Methods**:\n"
                            for m in methods:
                                content += f"  - `{m}`\n"
                            content += "\n"
                    else:
                        content += f"- `{cls}`\n"
                content += "\n"

            if functions:
                content += "## 🧮 Functions\n"
                for func in functions:
                    if isinstance(func, dict):
                        func_name = func.get("name", "Unknown")
                        content += f"### `def {func_name}`\n"
                        doc = func.get("docstring", "").strip()
                        if doc:
                            content += f"> {doc}\n\n"
                    else:
                        content += f"- `{func}`\n"
                content += "\n"

            # Dependencies (Graph Edges)
            dependencies = []
            if path in graph:
                dependencies = list(graph.successors(path))
            
            dependents = []
            if path in graph:
                dependents = list(graph.predecessors(path))
            
            content += "## 🔗 Code Connections\n"
            
            content += "### 📤 Dependencies (Imports)\n"
            if dependencies:
                for dep in dependencies:
                    content += f"- [[{dep}]]\n"
            else:
                content += "*No local dependencies detected.*\n"
            content += "\n"

            content += "### 📥 Dependents (Imported By)\n"
            if dependents:
                for dep in dependents:
                    content += f"- [[{dep}]]\n"
            else:
                content += "*No local dependents detected.*\n"
            content += "\n"

            # Code block
            content += "## 📝 Source Code\n"
            lang_map = {
                "py": "python",
                "js": "javascript",
                "jsx": "javascript",
                "ts": "typescript",
                "tsx": "typescript",
                "java": "java",
                "kt": "kotlin",
                "go": "go",
                "cs": "csharp",
                "cpp": "cpp",
                "h": "cpp",
                "rs": "rust",
                "rb": "ruby",
                "php": "php",
                "html": "html",
                "css": "css",
                "sh": "bash",
                "yml": "yaml",
                "yaml": "yaml",
                "json": "json",
                "md": "markdown",
                "sql": "sql"
            }
            code_lang = lang_map.get(ext, "")
            content += f"```{code_lang}\n"
            content += pf.content
            if not pf.content.endswith('\n'):
                content += '\n'
            content += "```\n"

            # Write file into the zip
            zip_file_path = f"{path}.md"
            zip_file.writestr(zip_file_path, content)

    zip_buffer.seek(0)
    return zip_buffer
