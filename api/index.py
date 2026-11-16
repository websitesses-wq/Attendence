import sys
import os

# Ensure the root directory is in Python's path so "from backend.main import app" resolves properly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app

