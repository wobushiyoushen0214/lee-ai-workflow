#!/usr/bin/env python3
"""lee-ai-workflow 的 install/update 入口；实现与旧安装入口共用。"""
from pathlib import Path
import runpy
import sys


if __name__ == "__main__":
    command = runpy.run_path(str(Path(__file__).with_name("install-workflow.py")))
    sys.exit(command["main"]())
