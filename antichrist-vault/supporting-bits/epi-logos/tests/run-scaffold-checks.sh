#!/bin/sh
set -eu

python3 -m py_compile scripts/validate_scaffold.py
python3 scripts/validate_scaffold.py
