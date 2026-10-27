#!/usr/bin/env python3
"""Prepara (git add) solo algunos bloques de un diff, sin el modo interactivo.

Uso:
  stage_hunks.py list [archivos...]      Muestra los bloques numerados (archivo#n)
  stage_hunks.py add archivo#n [...]     Prepara esos bloques en el indice

Los archivos nuevos deben marcarse antes con `git add -N archivo`.
"""
import subprocess
import sys


def git_diff(paths):
    out = subprocess.run(
        ["git", "diff", "--no-color", "--no-ext-diff", "-U3", "--", *paths],
        check=True, capture_output=True, text=True,
    ).stdout
    files = []
    cur = None
    for line in out.splitlines(keepends=True):
        if line.startswith("diff --git "):
            path = line.split(" b/", 1)[1].strip()
            cur = {"path": path, "header": [line], "hunks": []}
            files.append(cur)
        elif cur is None:
            continue
        elif line.startswith("@@"):
            cur["hunks"].append([line])
        elif cur["hunks"]:
            cur["hunks"][-1].append(line)
        else:
            cur["header"].append(line)
    return files


def summary(hunk):
    changed = [l[1:].strip() for l in hunk[1:] if l[:1] in "+-" and l[1:].strip()]
    plus = sum(1 for l in hunk[1:] if l.startswith("+"))
    minus = sum(1 for l in hunk[1:] if l.startswith("-"))
    first = changed[0][:70] if changed else ""
    return f"+{plus} -{minus}  {hunk[0].strip()[:60]}  | {first}"


def cmd_list(paths):
    for f in git_diff(paths):
        for i, h in enumerate(f["hunks"], 1):
            print(f"{f['path']}#{i}  {summary(h)}")


def cmd_add(refs):
    wanted = {}
    for ref in refs:
        path, _, num = ref.rpartition("#")
        wanted.setdefault(path, set()).add(int(num))
    patch = []
    for f in git_diff(list(wanted)):
        sel = wanted.get(f["path"])
        if not sel:
            continue
        missing = [n for n in sel if n < 1 or n > len(f["hunks"])]
        if missing:
            sys.exit(f"{f['path']}: no existen los bloques {missing}")
        patch.extend(f["header"])
        for i, h in enumerate(f["hunks"], 1):
            if i in sel:
                patch.extend(h)
    if not patch:
        sys.exit("No hay bloques para preparar")
    subprocess.run(
        ["git", "apply", "--cached", "--recount", "-"],
        input="".join(patch), text=True, check=True,
    )
    print("Preparados:", " ".join(refs))


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("list", "add"):
        sys.exit(__doc__)
    if sys.argv[1] == "list":
        cmd_list(sys.argv[2:])
    else:
        cmd_add(sys.argv[2:])
