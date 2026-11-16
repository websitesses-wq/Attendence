import sys
import os

# Robust path injection for Vercel Serverless environment
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)

for path_entry in [ROOT_DIR, CURRENT_DIR, os.getcwd()]:
    if path_entry and path_entry not in sys.path:
        sys.path.insert(0, path_entry)

try:
    from backend.main import app
except ImportError:
    # Fallback import if directory structure is flattened in serverless bundle
    from main import app
